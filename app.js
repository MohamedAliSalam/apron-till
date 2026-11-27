var $=function(id){return document.getElementById(id);};
function el(tag,cls,text){var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e;}
function cents(v){var n=parseFloat(String(v).replace(',','.')); return isFinite(n)?Math.round(n*100):0;}
function money(c){c=Math.round(c); return (c<0?'-':'')+'$'+(Math.abs(c)/100).toFixed(Math.abs(c)%100?2:0);}
function llFmt(n){ return Math.round(n).toLocaleString('en-US')+' LL'; }
function dayKey(t){var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function str(v){return v==null?'':String(v);}
function newId(){ return 'i'+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36); }

/* ---------- storage ---------- */
var K_CFG='apron.till.menu', K_ORD='apron.till.orders';
function readJSON(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }
function writeJSON(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } }
/* A menu is a flat list of items, each with a group. Older saved menus had "tickets" and
   "add-ons"; those are carried over as items so nothing disappears. */
function cleanMenu(m){
  var take=function(arr,cat){ return (Array.isArray(arr)?arr:[]).filter(function(x){return x&&x.id&&str(x.name).trim();})
    .map(function(x){ return {id:str(x.id),name:str(x.name).trim(),price:Math.max(0,cents(x.price))/100,cat:str(x.cat).trim()||cat}; }); };
  var items=take(m&&m.items,'Drinks');
  if(!items.length&&m) items=take(m.tickets,'Drinks').concat(take(m.addons,'Extras'));
  var rate=Math.round(Number(m&&m.rate));
  return {items:items,rate:rate>0?rate:89000};
}
var cfg, orders;
/* cloud.on means orders and the menu come from the shared database instead of this device */
var cloud={ready:false,on:false,user:null,db:null,unsub:[],pending:false}, pastOrders=null;
function localOrders(){ var o=readJSON(K_ORD); return (Array.isArray(o)?o:[]).filter(function(x){return x&&x.id;}); }
/* shown on a device that has no saved menu yet and is not signed in to sync */
var DEFAULT_MENU={"items":[{"id":"espresso","name":"Espresso","price":2,"cat":"Hot"},{"id":"americano","name":"Americano","price":2.5,"cat":"Hot"},{"id":"flat-white","name":"Flat White","price":3,"cat":"Hot"},{"id":"latte","name":"Latte","price":4,"cat":"Hot"},{"id":"spanish-latte","name":"Spanish Latte","price":5,"cat":"Hot"},{"id":"hot-chocolate","name":"Hot Chocolate","price":4.5,"cat":"Hot"},{"id":"iced-americano","name":"Iced Americano","price":3,"cat":"Iced"},{"id":"iced-latte","name":"Iced Latte","price":4,"cat":"Iced"},{"id":"iced-spanish-latte","name":"Iced Spanish Latte","price":5,"cat":"Iced"},{"id":"matcha-latte","name":"Matcha Latte","price":5,"cat":"Matcha"},{"id":"dirty-matcha","name":"Dirty Matcha","price":6,"cat":"Matcha"},{"id":"strawberry-matcha","name":"Strawberry Matcha","price":6,"cat":"Matcha"},{"id":"mango-matcha","name":"Mango Matcha","price":6,"cat":"Matcha"},{"id":"vanilla","name":"Vanilla","price":1,"cat":"Extras"},{"id":"caramel","name":"Caramel","price":1,"cat":"Extras"},{"id":"hazelnut","name":"Hazelnut","price":1,"cat":"Extras"},{"id":"pumpkin-spice","name":"Pumpkin Spice","price":1,"cat":"Extras"},{"id":"tiramisu","name":"Tiramisu","price":1,"cat":"Extras"},{"id":"cinnamon","name":"Cinnamon","price":1,"cat":"Extras"},{"id":"toffenut","name":"Toffenut","price":1,"cat":"Extras"},{"id":"espresso-shot","name":"Espresso Shot","price":1,"cat":"Extras"},{"id":"we-make-it-for-you","name":"We make it for you","price":1,"cat":"Extras"}],"rate":89000};
function loadAll(){ if(cloud.on) return; cfg=cleanMenu(readJSON(K_CFG)||DEFAULT_MENU); orders=localOrders(); }
function saveOrders(){ var ok=writeJSON(K_ORD,orders); if(!ok) warn('This device could not save the order. Its storage may be full or blocked. Export your orders, then free up space.'); return ok; }
function warn(msg){ var s=$('status'); s.textContent=msg; s.hidden=!msg; }
function shop(){ return cloud.db.collection('shops').doc('main'); }
function syncErr(e){ warn(e&&e.code==='permission-denied'?'Sync was refused for this login. Check the shop login in Admin.':'Sync hit a problem. Orders are kept on this device and will be sent when it clears.'); }
function addOrder(o){
  if(cloud.on){ shop().collection('orders').doc(o.id).set(o).catch(syncErr); return true; }
  orders.push(o); if(saveOrders()) return true; orders.pop(); return false;
}
function cloudWrite(ops){
  for(var i=0;i<ops.length;i+=400){
    var b=cloud.db.batch();
    ops.slice(i,i+400).forEach(function(op){ var ref=shop().collection('orders').doc(op[1].id); if(op[0]==='delete') b.delete(ref); else b.set(ref,op[1]); });
    b.commit().catch(syncErr);
  }
}
/* everything ever taken: the live list only covers the last day and a half when synced */
function histList(){
  if(!cloud.on||!pastOrders) return orders;
  var seen={}, out=[]; orders.concat(pastOrders).forEach(function(o){ if(!seen[o.id]){ seen[o.id]=true; out.push(o); } }); return out;
}
async function refreshHistory(){
  if(!cloud.on) return;
  try{ var snap=await shop().collection('orders').get(); pastOrders=snap.docs.map(function(d){return Object.assign({},d.data(),{id:d.id});}); }catch(e){}
}
loadAll();
if(navigator.storage&&navigator.storage.persist){ try{ navigator.storage.persist(); }catch(e){} }

var cart=[];            /* [{id, qty}] in the order the cashier added them */
var sel=null, selExtras={}, warned=false;   /* the drink tapped but not yet added; nothing joins the order until Add to order is tapped */
var edit=null, dirty=false;

/* ---------- tabs ---------- */
function showView(){
  var v=(location.hash||'').replace('#',''); if(['cashier','orders','admin'].indexOf(v)<0) v='cashier';
  ['cashier','orders','admin'].forEach(function(k){ $('v-'+k).hidden=k!==v; });
  if(v!=='admin'&&typeof lockAdmin==='function') lockAdmin();
  [].forEach.call(document.querySelectorAll('#tabs a'),function(a){ a.classList.toggle('on',a.dataset.v===v); });
}
window.addEventListener('hashchange',showView); showView();

/* ---------- cashier ---------- */
function item(id){ return cfg.items.filter(function(x){return x.id===id;})[0]||null; }
/* Items in a group called Extras (or Add-ons) are not drinks: they attach to the selected drink. */
function isExtra(it){ return /^(extras?|add-?ons?)$/i.test(str(it&&it.cat).trim()); }
function lineKey(id,extras){ return id+'|'+extras.slice().sort().join(','); }
function cartLines(){
  return cart.map(function(c){ var it=item(c.id); if(!it) return null;
    var ex=(c.extras||[]).map(item).filter(Boolean);
    var unit=cents(it.price)+ex.reduce(function(a,e){return a+cents(e.price);},0);
    return {key:c.key,id:it.id,name:it.name,base:it.price,extras:ex.map(function(e){return {name:e.name,price:e.price};}),price:unit/100,qty:c.qty};
  }).filter(Boolean);
}
var DISCOUNT_PCT=10, discount=false;   /* the cashier's "10% off" button, off again after every order */
function orderSubtotal(){ return cartLines().reduce(function(s,l){ return s+cents(l.price)*l.qty; },0); }
function orderDiscount(){ return discount?Math.round(orderSubtotal()*DISCOUNT_PCT/100):0; }
function orderTotal(){ return orderSubtotal()-orderDiscount(); }
function bump(key,by,id,extras){
  var c=cart.filter(function(x){return x.key===key;})[0];
  if(!c){ if(by>0) cart.push({key:key,id:id,extras:extras||[],qty:by}); }
  else { c.qty+=by; if(c.qty<=0) cart=cart.filter(function(x){return x!==c;}); }
  renderMenu(); renderSummary();
}
function renderMenu(){
  var box=$('menu'); box.textContent='';
  if(!cfg.items.length){ box.appendChild(el('p','empty','The menu is empty. Add your drinks in the Admin tab.')); return; }
  var cats=[]; cfg.items.forEach(function(it){ if(cats.indexOf(it.cat)<0) cats.push(it.cat); });
  cats.forEach(function(cat){
    var g=el('div','catgroup'); g.appendChild(el('span','label',cat));
    var grid=el('div','choices');
    cfg.items.filter(function(it){return it.cat===cat;}).forEach(function(it){
      var extra=isExtra(it), count=cart.reduce(function(n,c){ return n+(c.id===it.id?c.qty:0); },0);
      var b=el('button','choice'+(extra?' small':'')); b.type='button';
      b.setAttribute('aria-pressed',String(extra?!!selExtras[it.id]:sel===it.id));
      b.appendChild(el('b',null,it.name)); b.appendChild(el('span',null,(extra?'+':'')+money(cents(it.price))));
      if(extra){ b.disabled=!sel; }
      else if(count) b.appendChild(el('span','badge',count));
      b.addEventListener('click',function(){
        if(extra){ if(!sel) return; selExtras[it.id]=!selExtras[it.id]; } else { sel=it.id; }
        warned=false; renderMenu(); renderSummary();
      });
      grid.appendChild(b);
    });
    g.appendChild(grid); box.appendChild(g);
  });
}
function renderSummary(){
  cart=cart.filter(function(c){return item(c.id);});
  var lines=cartLines(), ul=$('cart'); ul.textContent='';
  var chosen=sel?item(sel):null; if(!chosen||isExtra(chosen)){ sel=null; chosen=null; }
  var picked=chosen?cfg.items.filter(function(x){return isExtra(x)&&selExtras[x.id];}):[];
  var selTotal=chosen?cents(chosen.price)+picked.reduce(function(a,e){return a+cents(e.price);},0):0;
  $('sel-name').textContent=chosen?chosen.name:'Nothing selected';
  $('sel-price').textContent=!chosen?'Tap a drink to select it':picked.length?'+ '+picked.map(function(e){return e.name;}).join(', ')+'  =  '+money(selTotal):money(selTotal)+'  ·  tap any extras, then add';
  $('add-sel').disabled=!chosen;
  if(!lines.length) ul.appendChild(el('li','none','Nothing added yet.'));
  lines.forEach(function(l){
    var li=el('li'), nm=el('span','nm',l.name); nm.appendChild(el('small',null,(l.extras.length?'+ '+l.extras.map(function(e){return e.name;}).join(', ')+'  ·  ':'')+money(cents(l.price))+' each'));
    var q=el('span','qty'), minus=el('button',null,'−'), plus=el('button',null,'+');
    minus.type='button'; plus.type='button'; minus.setAttribute('aria-label','One fewer '+l.name); plus.setAttribute('aria-label','One more '+l.name);
    minus.addEventListener('click',function(){ bump(l.key,-1); }); plus.addEventListener('click',function(){ bump(l.key,1); });
    q.appendChild(minus); q.appendChild(el('b',null,l.qty)); q.appendChild(plus);
    li.appendChild(nm); li.appendChild(q); li.appendChild(el('span',null,money(cents(l.price)*l.qty))); ul.appendChild(li);
  });
  if(!lines.length) discount=false;
  var total=orderTotal(), off=orderDiscount();
  $('disc').disabled=!lines.length; $('disc').setAttribute('aria-pressed',String(discount));
  $('disc-amt').textContent=off?'−'+money(off)+' off '+money(orderSubtotal()):'';
  $('total').textContent=money(total); $('pay-total').textContent=money(total);
  $('total-ll').textContent=total?'= '+llFmt(total/100*cfg.rate)+' at '+cfg.rate.toLocaleString('en-US')+' LL per $1':'';
  $('place').disabled=!lines.length;
}
$('add-sel').addEventListener('click',function(){
  if(!sel) return;
  var id=sel, ex=cfg.items.filter(function(x){return isExtra(x)&&selExtras[x.id];}).map(function(x){return x.id;});
  sel=null; selExtras={}; warned=false; bump(lineKey(id,ex),1,id,ex);
});
$('disc').addEventListener('click',function(){ discount=!discount; warned=false; renderSummary(); });
function clearOrder(){ discount=false; cart=[]; sel=null; selExtras={}; warned=false; ['c-name','c-phone','c-note'].forEach(function(id){$(id).value='';}); renderMenu(); renderSummary(); }
$('clear-cart').addEventListener('click',clearOrder);
function flash(msg,err){ var f=$('flash'); f.textContent=msg; f.className='flash'+(err?' err':''); f.hidden=false; }
$('place').addEventListener('click',function(){
  var lines=cartLines(); if(!lines.length) return;
  var waiting=sel?item(sel):null;
  if(waiting&&!warned){ warned=true; flash(waiting.name+' is selected but not added. Tap "Add to order" to include it, or tap "Paid, send order" again to send without it.',true); return; }
  var total=orderTotal(), subtotal=orderSubtotal(), off=orderDiscount();
  loadAll();
  var today=dayKey(Date.now());
  var n=orders.filter(function(o){return o.day===today;}).reduce(function(m,o){return Math.max(m,Number(o.n)||0);},0)+1;
  var order={id:newId(),n:n,day:today,createdAt:Date.now(),status:'new',
    items:lines.map(function(l){return {name:l.name,price:l.price,qty:l.qty,base:l.base,extras:l.extras};}),
    subtotal:subtotal/100,discount:off/100,discountPct:off?DISCOUNT_PCT:0,total:total/100,method:'mymonty',rate:cfg.rate,
    name:$('c-name').value.trim(),phone:$('c-phone').value.trim(),note:$('c-note').value.trim()};
  if(!addOrder(order)){ flash('The order was not saved.',true); return; }
  flash('Order #'+n+' is on the Orders screen. '+money(total)+' by MyMonty.');
  clearOrder(); renderAll();
});
var payQr=$('pay-qr');
payQr.addEventListener('load',function(){ payQr.hidden=false; });
if(payQr.complete&&payQr.naturalWidth) payQr.hidden=false;

/* ---------- orders wall ---------- */
/* what an order contains, old one-ticket orders included */
function orderLines(o){
  if(Array.isArray(o.items)&&o.items.length) return o.items.map(function(l){ var ex=(Array.isArray(l&&l.extras)?l.extras:[]).map(function(e){return {name:str(e&&e.name),price:Number(e&&e.price)||0};});
    return {name:str(l&&l.name),qty:Number(l&&l.qty)||1,price:Number(l&&l.price)||0,base:l&&l.base!=null?Number(l.base)||0:Number(l&&l.price)||0,extras:ex}; });
  var out=[]; if(o.ticket&&o.ticket.name) out.push({name:str(o.ticket.name),qty:1,price:Number(o.ticket.price)||0});
  (Array.isArray(o.addons)?o.addons:[]).forEach(function(a){ out.push({name:str(a&&a.name),qty:1,price:Number(a&&a.price)||0}); });
  return out;
}
function lineText(l){ return l.name+(l.extras&&l.extras.length?' + '+l.extras.map(function(e){return e.name;}).join(' + '):''); }
function orderText(o){ return orderLines(o).map(function(l){return (l.qty>1?l.qty+'× ':'')+lineText(l);}).join(', '); }
function setStatus(id,status){
  if(cloud.on){ shop().collection('orders').doc(id).update(status==='done'?{status:'done',doneAt:Date.now()}:{status:'new'}).catch(syncErr); return; }
  loadAll(); var o=orders.filter(function(x){return x.id===id;})[0]; if(!o) return;
  o.status=status; if(status==='done') o.doneAt=Date.now(); saveOrders(); renderAll();
}
function renderWall(){
  var open=orders.filter(function(o){return o.status==='new';}).sort(function(a,b){return a.createdAt-b.createdAt;});
  var q=$('qcount'); q.hidden=!open.length; q.textContent=open.length;
  $('wallcount').textContent=open.length?open.length+' waiting':'';
  var wall=$('wall'); wall.textContent='';
  if(!open.length) wall.appendChild(el('p','empty','No orders waiting. New orders from the cashier show up here by themselves.'));
  open.forEach(function(o){
    var c=el('article','ticket'), top=el('div','top');
    top.appendChild(el('span','num','#'+(Number(o.n)||'?')));
    var mins=Math.max(0,Math.floor((Date.now()-o.createdAt)/60000));
    top.appendChild(el('span','wait',mins<1?'just now':mins+' min ago')); c.appendChild(top);
    if(o.name) c.appendChild(el('div','who',str(o.name)));
    var ul=el('ul','lines2'); orderLines(o).forEach(function(l){ ul.appendChild(el('li',null,l.qty+'× '+l.name)); if(l.extras&&l.extras.length) ul.appendChild(el('li','ex','+ '+l.extras.map(function(e){return e.name;}).join(', '))); }); c.appendChild(ul);
    if(o.note) c.appendChild(el('div','note',str(o.note)));
    var b=el('button','big','Done'); b.type='button'; b.addEventListener('click',function(){ setStatus(o.id,'done'); }); c.appendChild(b);
    wall.appendChild(c);
  });
  var done=orders.filter(function(o){return o.status==='done';}).sort(function(a,b){return (b.doneAt||0)-(a.doneAt||0);}).slice(0,8);
  var dl=$('donelist'); dl.textContent='';
  if(!done.length) dl.appendChild(el('li')).appendChild(el('span',null,'Nothing finished yet.'));
  done.forEach(function(o){
    var li=el('li'); li.appendChild(el('span',null,'#'+(Number(o.n)||'?')+'  '+orderText(o)+(o.name?'  ·  '+str(o.name):'')));
    var u=el('button','link','Put back'); u.type='button'; u.addEventListener('click',function(){ setStatus(o.id,'new'); }); li.appendChild(u);
    dl.appendChild(li);
  });
}
setInterval(function(){ if(!$('v-orders').hidden) renderWall(); },30000);

/* ---------- admin ---------- */
function customers(list){
  var seen={}, rows=[];
  list.forEach(function(o){ if(!o.name&&!o.phone) return; var k=str(o.phone)||('n:'+str(o.name));
    if(seen[k]){ seen[k].count++; seen[k].spent+=cents(o.total); return; }
    seen[k]={name:str(o.name),phone:str(o.phone),count:1,spent:cents(o.total)}; rows.push(seen[k]); });
  return rows;
}
function renderToday(){
  var today=dayKey(Date.now()), list=orders.filter(function(o){return o.day===today;});
  $('t-orders').textContent=list.length; $('t-sales').textContent=money(list.reduce(function(s,o){return s+cents(o.total);},0));
  $('t-wait').textContent=orders.filter(function(o){return o.status==='new';}).length;
  var drinks=list.reduce(function(s,o){ return s+orderLines(o).reduce(function(a,l){return a+l.qty;},0); },0);
  $('t-split').textContent=drinks+(drinks===1?' item sold today':' items sold today');
  var rows=customers(histList().slice().sort(function(a,b){return b.createdAt-a.createdAt;}));
  var tb=$('cust'); tb.textContent='';
  if(!rows.length){ var tr=el('tr'), td=el('td',null,'Customers who give a name or number appear here.'); td.colSpan=3; tr.appendChild(td); tb.appendChild(tr); }
  rows.forEach(function(r){ var tr=el('tr'); tr.appendChild(el('td',null,r.name||'—')); tr.appendChild(el('td',null,r.phone||'—')); tr.appendChild(el('td','num',r.count)); tb.appendChild(tr); });
  $('copy-cust').onclick=function(){
    var text=rows.map(function(r){return r.name+'\t'+r.phone;}).join('\n'), b=$('copy-cust');
    try{ navigator.clipboard.writeText(text).then(function(){b.textContent='Copied';},function(){b.textContent='Copy failed';}); }catch(e){ b.textContent='Copy failed'; }
  };
}
function renderEditor(){
  var dl=$('cats'), cats=[]; dl.textContent='';
  edit.items.forEach(function(it){ var c=str(it.cat).trim(); if(c&&!isExtra(it)&&cats.indexOf(c)<0) cats.push(c); });
  cats.forEach(function(c){ var o=el('option'); o.value=c; dl.appendChild(o); });
  [[false,'e-items','No drinks yet. Add your first one below.'],[true,'e-extras','No extras yet.']].forEach(function(part){
    var extras=part[0], box=$(part[1]); box.textContent='';
    var list=edit.items.filter(function(it){ return isExtra(it)===extras; });
    if(!list.length) box.appendChild(el('p','empty',part[2]));
    list.forEach(function(it){
      var row=el('div',extras?'row':'row item'), name=el('input'), price=el('input'), del=el('button',null,'\u00d7');
      name.value=str(it.name); name.placeholder=extras?'Extra name':'Drink name'; name.id='e-n-'+it.id; name.setAttribute('aria-label',extras?'Extra name':'Drink name');
      price.value=it.price===''?'':str(it.price); price.placeholder='$'; price.inputMode='decimal'; price.id='e-p-'+it.id; price.setAttribute('aria-label','Price in dollars');
      name.addEventListener('input',function(){ it.name=name.value; dirty=true; });
      price.addEventListener('input',function(){ it.price=price.value; dirty=true; });
      del.type='button'; del.setAttribute('aria-label','Remove '+str(it.name));
      del.addEventListener('click',function(){ edit.items.splice(edit.items.indexOf(it),1); dirty=true; renderEditor(); });
      row.appendChild(name);
      if(!extras){
        var cat=el('input','cat'); cat.value=str(it.cat); cat.placeholder='Group'; cat.id='e-c-'+it.id; cat.setAttribute('list','cats'); cat.setAttribute('aria-label','Group');
        cat.addEventListener('input',function(){ it.cat=cat.value; dirty=true; }); row.appendChild(cat);
      }
      row.appendChild(price); row.appendChild(del); box.appendChild(row);
    });
  });
}
function addRow(extras){
  var drinks=edit.items.filter(function(it){return !isExtra(it);}), last=drinks[drinks.length-1];
  edit.items.push({id:newId(),name:'',price:'',cat:extras?'Extras':(last?last.cat:'Drinks')}); dirty=true; renderEditor();
  var rows=$(extras?'e-extras':'e-items').querySelectorAll('.row'); if(rows.length) rows[rows.length-1].querySelector('input').focus();
}
$('add-item').addEventListener('click',function(){ addRow(false); });
$('add-extra').addEventListener('click',function(){ addRow(true); });
$('e-rate').addEventListener('input',function(){ dirty=true; });
$('save-menu').addEventListener('click',function(){
  var items=edit.items.filter(function(x){return str(x.name).trim();}).map(function(x){ return {id:x.id,name:str(x.name).trim(),price:Math.max(0,cents(x.price))/100,cat:str(x.cat).trim()||'Drinks'}; });
  var rate=parseInt(String($('e-rate').value).replace(/[^\d]/g,''),10)||cfg.rate;
  items=items.filter(function(x){return !isExtra(x);}).concat(items.filter(isExtra));
  var body={items:items,rate:rate};
  if(writeJSON(K_CFG,body)){ if(cloud.on) shop().collection('config').doc('menu').set(body).catch(syncErr); cfg=cleanMenu(body); dirty=false; loadEditor(); renderAll(); $('save-msg').textContent='Saved. The cashier tab is updated.'; }
  else $('save-msg').textContent='Not saved. This device’s storage is full or blocked.';
});
function loadEditor(){ edit={items:cfg.items.map(function(t){return {id:t.id,name:t.name,price:t.price,cat:t.cat};})}; $('e-rate').value=cfg.rate; renderEditor(); }

/* ---------- export, backup, reset ---------- */
/* On a phone or tablet that can share files, open the share sheet (Save to Files, WhatsApp, email).
   Everywhere else, download the file the normal way. */
function saveFile(name,blob){
  var viaLink=function(){
    var a=document.createElement('a'), url=URL.createObjectURL(blob); a.href=url; a.download=name; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },4000);
  };
  var file=null; try{ file=new File([blob],name,{type:blob.type}); }catch(e){}
  var handheld=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  try{
    if(handheld&&file&&navigator.canShare&&navigator.canShare({files:[file]})){
      navigator.share({files:[file],title:name}).catch(function(e){ if(!e||e.name!=='AbortError') viaLink(); });
      return 'shared';
    }
  }catch(e){}
  viaLink(); return 'downloaded';
}
$('export').addEventListener('click',async function(){
  var msg=$('export-msg');
  if(!window.XLSX){ msg.textContent='The Excel export did not load. Reload the app and try again.'; return; }
  await refreshHistory();
  var list=histList().slice().sort(function(a,b){return (a.createdAt||0)-(b.createdAt||0);});
  var sold={}, soldRows=[];
  var rows=list.map(function(o){ var d=new Date(Number(o.createdAt)||0), lines=orderLines(o);
    var count=function(name,qty,price){ if(!sold[name]){ sold[name]={'Item':name,'Sold':0,'Sales ($)':0}; soldRows.push(sold[name]); } sold[name]['Sold']+=qty; sold[name]['Sales ($)']=Math.round((sold[name]['Sales ($)']+qty*price)*100)/100; };
    lines.forEach(function(l){ var ex=l.extras||[]; count(l.name,l.qty,ex.length&&l.base!=null?l.base:l.price); ex.forEach(function(e){ count(e.name,l.qty,e.price); }); });
    return { 'Order':Number(o.n)||'', 'Date':dayKey(d.getTime()), 'Time':('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),
      'Items':lines.map(function(l){return l.qty+'x '+lineText(l);}).join(', '), 'Item count':lines.reduce(function(a,l){return a+l.qty;},0),
      'Subtotal ($)':o.subtotal!=null?Number(o.subtotal)||0:Number(o.total)||0, 'Discount ($)':Number(o.discount)||0, 'Total ($)':Number(o.total)||0, 'Paid by':str(o.method), 'Name':str(o.name), 'Phone':str(o.phone), 'Note':str(o.note), 'Status':o.status==='done'?'Done':'Waiting' }; });
  soldRows.sort(function(a,b){return b['Sold']-a['Sold'];});
  var cust=customers(list).map(function(r){return {'Name':r.name,'Phone':r.phone,'Orders':r.count,'Spent ($)':r.spent/100};});
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{'Order':'No orders yet'}]),'Orders');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(soldRows.length?soldRows:[{'Item':'Nothing sold yet'}]),'Items sold');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(cust.length?cust:[{'Name':'No customers yet'}]),'Customers');
  var buf=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  var how=saveFile('apron-orders-'+dayKey(Date.now())+'.xlsx',new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  msg.textContent=how==='shared'?rows.length+' orders ready. Choose where to save or send the file.':'Exported '+rows.length+' orders. Look in the Downloads folder.';
});
$('backup').addEventListener('click',async function(){
  await refreshHistory(); var all=histList();
  saveFile('apron-backup-'+dayKey(Date.now())+'.json',new Blob([JSON.stringify({app:'apron-till',savedAt:Date.now(),menu:cfg,orders:all})],{type:'application/json'}));
  $('backup-msg').textContent='Backup saved with '+all.length+' orders.';
});
$('restore').addEventListener('change',function(){
  var f=this.files&&this.files[0], input=this; if(!f) return;
  var r=new FileReader();
  r.onload=function(){
    try{
      var d=JSON.parse(r.result); if(!d||d.app!=='apron-till'||!Array.isArray(d.orders)) throw 0;
      var have={}; histList().forEach(function(o){have[o.id]=true;});
      var fresh=d.orders.filter(function(o){ return o&&o.id&&!have[o.id]; }), added=fresh.length;
      if(cloud.on) cloudWrite(fresh.map(function(o){return ['set',o];})); else { orders=orders.concat(fresh); saveOrders(); }
      renderAll(); $('backup-msg').textContent='Restored '+added+' orders that were not already here.';
    }catch(e){ $('backup-msg').textContent='That file is not an Apron backup.'; }
    input.value='';
  };
  r.readAsText(f);
});
function wipeUI(open){ $('wipe').hidden=open; $('wipe-yes').hidden=!open; $('wipe-no').hidden=!open; }
$('wipe').addEventListener('click',function(){ wipeUI(true); $('backup-msg').textContent=cloud.on?'This removes every order from all synced devices and cannot be undone. Export or back up first.':'This removes all '+orders.length+' orders from this device and cannot be undone. Export or back up first.'; });
$('wipe-no').addEventListener('click',function(){ wipeUI(false); $('backup-msg').textContent=''; });
$('wipe-yes').addEventListener('click',async function(){
  if(cloud.on){ await refreshHistory(); cloudWrite(histList().map(function(o){return ['delete',o];})); pastOrders=[]; }
  else { orders=[]; saveOrders(); }
  wipeUI(false); renderAll(); $('backup-msg').textContent='All orders deleted.';
});

/* ---------- admin password ---------- */
var K_PASS='apron.till.pass', unlocked=false, changing=false;
/* The starting password is stored only as a salted hash. Change it in Admin. */
var DEFAULT_PASS={salt:'apron-default-0cc024592e7a5668',hash:'320ec9d823bd7f16feeda0399dc209ac605ddd155605e6ae91bf7927cecd8b4d'};
function passRec(){ var p=readJSON(K_PASS); return p&&p.salt&&p.hash?p:DEFAULT_PASS; }
async function hashPass(p,salt){
  var buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+':'+p));
  return [].map.call(new Uint8Array(buf),function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
}
function renderLock(){
  var setting=!passRec()||changing;
  $('v-admin').classList.toggle('locked',!unlocked||changing);
  $('lock-title').textContent=changing?'Change the admin password':setting?'Set an admin password':'Admin is locked';
  $('lock-hint').textContent=setting?'Choose a password of at least 4 characters and write it down. It protects prices, the customer list, exports and resets on this device.':'Enter the admin password to see sales, customers and the menu.';
  $('lock-pass2').hidden=!setting; $('lock-go').textContent=setting?'Save password':'Unlock';
}
function lockAdmin(){ if(!unlocked&&!changing) return; unlocked=false; changing=false; $('lock-pass').value=''; $('lock-pass2').value=''; $('lock-msg').textContent=''; renderLock(); }
$('lock-form').addEventListener('submit',async function(e){
  e.preventDefault();
  var p=$('lock-pass').value, msg=$('lock-msg'), rec=passRec();
  if(!window.crypto||!crypto.subtle){ msg.textContent='The password lock needs the secure (https) address.'; return; }
  if(!rec||changing){
    if(p.length<4){ msg.textContent='Use at least 4 characters.'; return; }
    if(p!==$('lock-pass2').value){ msg.textContent='The two passwords do not match.'; return; }
    var salt=newId()+newId();
    if(!writeJSON(K_PASS,{salt:salt,hash:await hashPass(p,salt)})){ msg.textContent='The password could not be saved on this device.'; return; }
    changing=false; unlocked=true;
  }else{
    if(await hashPass(p,rec.salt)!==rec.hash){ msg.textContent='Wrong password.'; $('lock-pass').value=''; return; }
    unlocked=true;
  }
  $('lock-pass').value=''; $('lock-pass2').value=''; msg.textContent=''; renderLock();
  if(cloud.on) refreshHistory().then(renderToday);
});
$('lock-now').addEventListener('click',lockAdmin);
$('lock-change').addEventListener('click',function(){ changing=true; renderLock(); $('lock-pass').focus(); });
renderLock();

/* ---------- sync between devices (optional) ---------- */
function renderSync(){
  var dot=$('syncdot'), hint=$('sync-hint'), form=$('sync-form'), off=$('sync-off');
  form.hidden=true; off.hidden=true; dot.textContent='Saved on this device';
  if(!window.APRON_FIREBASE){ hint.textContent='Sync is not set up yet. Orders stay on this device only.'; return; }
  if(!cloud.ready){ hint.textContent='Sync has not started. Connect to the internet once and reload the app.'; return; }
  if(!cloud.user){ hint.textContent='Sign in with the shop login to share orders between your devices. Orders already on this device are sent up when you do.'; form.hidden=false; return; }
  off.hidden=false;
  dot.textContent=!navigator.onLine?'Offline, will sync':cloud.pending?'Syncing…':'Synced';
  hint.textContent='Sync is on as '+str(cloud.user.email)+'. Orders are shared with every device signed in with this login.';
}
function goOnline(){
  if(cloud.on) return; cloud.on=true; pastOrders=null;
  var mine=localOrders();
  if(mine.length) Promise.all(mine.map(function(o){ return shop().collection('orders').doc(o.id).set(o); })).then(function(){ writeJSON(K_ORD,[]); },syncErr);
  orders=mine;
  cloud.unsub.push(shop().collection('orders').where('createdAt','>=',Date.now()-36*3600*1000).onSnapshot({includeMetadataChanges:true},function(snap){
    orders=snap.docs.map(function(d){ var o=d.data()||{}; return Object.assign({},o,{id:d.id,createdAt:Number(o.createdAt)||0}); });
    cloud.pending=snap.metadata.hasPendingWrites; renderAll(); renderSync();
  },syncErr));
  var menuRef=shop().collection('config').doc('menu');
  cloud.unsub.push(menuRef.onSnapshot(function(snap){
    if(snap.exists){ cfg=cleanMenu(snap.data()); writeJSON(K_CFG,cfg); if(!dirty) loadEditor(); renderAll(); }
    else if(!snap.metadata.fromCache){ menuRef.set(cfg).catch(syncErr); }
  },syncErr));
}
function goLocal(){
  cloud.unsub.forEach(function(u){ try{u();}catch(e){} }); cloud.unsub=[]; cloud.on=false; cloud.pending=false; pastOrders=null; loadAll(); renderAll();
}
function loadScript(src){ return new Promise(function(ok,no){ var s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=no; document.head.appendChild(s); }); }
async function startCloud(){
  if(!window.APRON_FIREBASE) return;
  try{
    var base='https://www.gstatic.com/firebasejs/10.12.2/firebase-';
    await loadScript(base+'app-compat.js'); await loadScript(base+'auth-compat.js'); await loadScript(base+'firestore-compat.js');
    firebase.initializeApp(window.APRON_FIREBASE);
    cloud.db=firebase.firestore();
    try{ await cloud.db.enablePersistence({synchronizeTabs:true}); }catch(e){}
    cloud.ready=true;
    firebase.auth().onAuthStateChanged(function(u){ cloud.user=u; if(u) goOnline(); else if(cloud.on) goLocal(); renderSync(); });
  }catch(e){ renderSync(); }
}
$('sync-form').addEventListener('submit',function(e){
  e.preventDefault(); var msg=$('sync-msg'), b=$('sync-go'); if(!cloud.ready) return;
  b.disabled=true; msg.textContent='Signing in…';
  firebase.auth().signInWithEmailAndPassword($('sync-email').value.trim(),$('sync-pass').value).then(function(){ $('sync-pass').value=''; msg.textContent=''; },
    function(err){ msg.textContent=err&&err.code==='auth/network-request-failed'?'No internet. Connect and try again.':'Wrong email or password.'; }).then(function(){ b.disabled=false; });
});
$('sync-off').addEventListener('click',function(){ if(cloud.ready) firebase.auth().signOut(); });
window.addEventListener('online',renderSync); window.addEventListener('offline',renderSync);

/* ---------- boot ---------- */
function renderAll(){ renderMenu(); renderSummary(); renderWall(); renderToday(); }
loadEditor(); renderAll(); renderSync(); startCloud();
/* a second window on the same device (for example the Orders screen) stays in step */
window.addEventListener('storage',function(e){ if(e.key!==K_ORD&&e.key!==K_CFG) return; loadAll(); if(!dirty) loadEditor(); renderAll(); });
if(!writeJSON('apron.till.probe',1)) warn('This browser is blocking storage, so orders cannot be saved. Leave private browsing mode and reload.');
if('serviceWorker' in navigator && location.protocol.indexOf('http')===0){ navigator.serviceWorker.register('sw.js').catch(function(){}); }
