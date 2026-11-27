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
function priceOrNull(v){ var c=cents(v); return c>0?c/100:null; }
/* A drink has a hot price, an iced price, or both. An extra has one price and cat "Extras". */
function cleanMenu(m){
  var out=[];
  var push=function(x,cat){
    if(!x||!x.id||!str(x.name).trim()) return;
    var c=str(x.cat).trim()||cat||'', id=str(x.id), name=str(x.name).trim();
    if(/^(extras?|add-?ons?)$/i.test(c)){ out.push({id:id,name:name,price:Math.max(0,cents(x.price))/100,cat:'Extras',milkOnly:!!x.milkOnly,
      /* each choice may add its own price: a name, or {name, add} */
      options:(Array.isArray(x.options)?x.options:[]).map(function(o){ return typeof o==='string'?{name:o.trim(),add:0}:{name:str(o&&o.name).trim(),add:Math.max(0,cents(o&&o.add))/100}; }).filter(function(o){return o.name;})}); return; }
    var hot=priceOrNull(x.hot), iced=priceOrNull(x.iced);
    if(hot==null&&iced==null) hot=Math.max(0,cents(x.price))/100;   /* older menus had a single price */
    out.push({id:id,name:name,hot:hot,iced:iced,milk:!!x.milk,
      variants:(Array.isArray(x.variants)?x.variants:[]).map(function(v){ return {name:str(v&&v.name).trim(),add:Math.max(0,cents(v&&v.add))/100}; }).filter(function(v){return v.name;})});
  };
  (Array.isArray(m&&m.items)?m.items:[]).forEach(function(x){ push(x); });
  if(!out.length&&m){ (Array.isArray(m.tickets)?m.tickets:[]).forEach(function(x){ push(x,'Drinks'); }); (Array.isArray(m.addons)?m.addons:[]).forEach(function(x){ push(x,'Extras'); }); }
  var rate=Math.round(Number(m&&m.rate));
  return {items:out,rate:rate>0?rate:89000};
}
var cfg, orders;
/* cloud.on means orders and the menu come from the shared database instead of this device */
var cloud={ready:false,on:false,user:null,db:null,unsub:[],pending:false}, pastOrders=null;
function localOrders(){ var o=readJSON(K_ORD); return (Array.isArray(o)?o:[]).filter(function(x){return x&&x.id;}); }
/* shown on a device that has no saved menu yet and is not signed in to sync */
var DEFAULT_MENU={items:[
  {id:'espresso',name:'Espresso',hot:2},{id:'americano',name:'Americano',hot:2.5,iced:3},{id:'flat-white',name:'Flat White',hot:3,milk:true},
  {id:'latte',name:'Latte',hot:4,iced:4,milk:true},{id:'spanish-latte',name:'Spanish',hot:5,iced:5,milk:true},{id:'hot-chocolate',name:'Hot Chocolate',hot:4,milk:true},
  {id:'matcha',name:'Matcha',hot:5,iced:5,milk:true,variants:[{name:'Dirty',add:1},{name:'Strawberry',add:1},{name:'Mango',add:1}]},
  {id:'syrup',name:'Syrup',price:1,cat:'Extras',options:['Vanilla','Caramel','Hazelnut','Pumpkin Spice','Tiramisu','Cinnamon','Toffenut']},
  {id:'milk',name:'Milk',price:0,cat:'Extras',milkOnly:true,options:[{name:'Oat',add:1},{name:'Lactose free',add:0},{name:'Almond',add:1}]},
  {id:'espresso-shot',name:'Espresso Shot',price:1,cat:'Extras'},{id:'we-make-it',name:'We make it',price:1,cat:'Extras'}],rate:89000};
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
var sel=null, selTemp=null, selVar=null, openExtra=null, selExtras={}, warned=false;   /* selExtras: id -> true, or the chosen option */   /* the drink tapped but not yet added; nothing joins the order until Add to order is tapped */
var edit=null, dirty=false;

/* ---------- tabs ---------- */
function showView(){
  var v=(location.hash||'').replace('#',''); if(['cashier','orders','admin'].indexOf(v)<0) v='cashier';
  ['cashier','orders','admin'].forEach(function(k){ $('v-'+k).hidden=k!==v; });
  document.querySelector('main').dataset.v=v;
  if(v!=='admin'&&typeof lockAdmin==='function') lockAdmin();
  [].forEach.call(document.querySelectorAll('#tabs a'),function(a){ a.classList.toggle('on',a.dataset.v===v); });
}
window.addEventListener('hashchange',showView); showView();

/* ---------- cashier ---------- */
/* One screen, three steps: pick a drink, pick hot or iced, tick any extras, then Add to order.
   Nothing joins the order until Add to order is tapped. */
function item(id){ return cfg.items.filter(function(x){return x.id===id;})[0]||null; }
function isExtra(it){ return !!it&&it.cat==='Extras'; }
function temps(it){ var t=[]; if(it&&it.hot!=null) t.push('hot'); if(it&&it.iced!=null) t.push('iced'); return t; }
function variantOf(it,name){ return name?(it.variants||[]).filter(function(v){return v.name===name;})[0]||null:null; }
/* "Iced Dirty Matcha": hot or iced only when the drink is sold both ways, then the kind, then the drink */
function drinkName(it,temp,variant){ return (temps(it).length>1?(temp==='iced'?'Iced ':'Hot '):'')+(variant?variant.name+' ':'')+it.name; }
function extraName(e,opt){ return e.name+(opt?': '+opt:''); }
/* what a chosen option adds on top of the add-on's own price, such as +1 for oat milk */
function optAdd(e,opt){ var o=opt?(e.options||[]).filter(function(x){return x.name===opt;})[0]:null; return o?o.add:0; }
function lineKey(id,temp,variant,extras){ return id+'|'+temp+'|'+(variant||'')+'|'+extras.map(function(e){return e.id+':'+(e.opt||'');}).sort().join(','); }
function cartLines(){
  return cart.map(function(c){ var it=item(c.id); if(!it||isExtra(it)||it[c.temp]==null) return null;
    var v=variantOf(it,c.variant); if(c.variant&&!v) return null;
    var ex=(c.extras||[]).map(function(e){ var x=item(e.id); return isExtra(x)?{name:extraName(x,e.opt),price:(cents(x.price)+cents(optAdd(x,e.opt)))/100}:null; }).filter(Boolean);
    var base=cents(it[c.temp])+(v?cents(v.add):0);
    var unit=base+ex.reduce(function(a,e){return a+cents(e.price);},0);
    return {key:c.key,id:it.id,temp:c.temp,variant:c.variant||'',name:drinkName(it,c.temp,v),base:base/100,extras:ex,price:unit/100,qty:c.qty};
  }).filter(Boolean);
}
var discountPct=0;   /* 0, 10 or 50: set by the cashier's discount buttons, back to 0 after every order */
function orderSubtotal(){ return cartLines().reduce(function(s,l){ return s+cents(l.price)*l.qty; },0); }
function orderDiscount(){ return discountPct?Math.round(orderSubtotal()*discountPct/100):0; }
function orderTotal(){ return orderSubtotal()-orderDiscount(); }
function bump(key,by,line){
  var c=cart.filter(function(x){return x.key===key;})[0];
  if(!c){ if(by>0&&line) cart.push({key:key,id:line.id,temp:line.temp,variant:line.variant,extras:line.extras,qty:by}); }
  else { c.qty+=by; if(c.qty<=0) cart=cart.filter(function(x){return x!==c;}); }
  renderMenu(); renderSummary();
}
/* the extras ticked for the drink being built: [{id, opt}] */
function pickedExtras(){ var d=sel?item(sel):null; return cfg.items.filter(function(x){return isExtra(x)&&selExtras[x.id]&&(!x.milkOnly||(d&&d.milk));}).map(function(x){ return {id:x.id,opt:selExtras[x.id]===true?'':selExtras[x.id],item:x}; }); }
function tap(fn){ return function(){ fn(); warned=false; renderMenu(); renderSummary(); }; }
function renderMenu(){
  var chosen=sel?item(sel):null; if(!chosen||isExtra(chosen)){ sel=null; selTemp=null; selVar=null; openExtra=null; chosen=null; }
  if(chosen&&temps(chosen).indexOf(selTemp)<0) selTemp=temps(chosen).indexOf('hot')>=0?'hot':(temps(chosen)[0]||null);
  if(chosen&&selVar&&!variantOf(chosen,selVar)) selVar=null;
  $('step-list').hidden=!!chosen; $('step-drink').hidden=!chosen; $('drink-title').textContent=chosen?chosen.name:'';
  var dbox=$('drinks'); dbox.textContent='';
  var list=cfg.items.filter(function(x){return !isExtra(x);});
  if(!list.length) dbox.appendChild(el('p','empty','No drinks yet. Add them in the Admin tab.'));
  list.forEach(function(it){
    var count=cart.reduce(function(n,c){ return n+(c.id===it.id?c.qty:0); },0), t=temps(it);
    var b=el('button','choice tile'); b.type='button'; b.setAttribute('aria-pressed','false');
    b.appendChild(el('b',null,it.name));
    b.appendChild(el('span',null,(t.length>1&&it.hot!==it.iced?money(cents(it.hot))+' / '+money(cents(it.iced)):money(cents(it[t[0]])))+(it.variants.length?' +':'')));
    if(count) b.appendChild(el('span','badge',count));
    b.addEventListener('click',tap(function(){ sel=it.id; selTemp=t.indexOf('hot')>=0?'hot':(t[0]||null); selVar=null;   /* Hot is the starting choice */ openExtra=null; selExtras={}; }));
    dbox.appendChild(b);
  });
  var tbox=$('temps'); tbox.textContent='';
  [['hot','Hot'],['iced','Iced']].forEach(function(p){
    var has=!!chosen&&chosen[p[0]]!=null, b=el('button','choice temp'); b.type='button'; b.disabled=!has;
    b.setAttribute('aria-pressed',String(has&&selTemp===p[0]));
    b.appendChild(el('b',null,p[1])); b.appendChild(el('span',null,has?money(cents(chosen[p[0]])):chosen?'Not sold':'—'));
    b.addEventListener('click',tap(function(){ if(has) selTemp=p[0]; }));
    tbox.appendChild(b);
  });
  /* kinds of this drink, such as Regular / Dirty / Strawberry for Matcha */
  var kinds=chosen?chosen.variants:[], kbox=$('kinds'); kbox.textContent='';
  kbox.hidden=!kinds.length; $('kinds-label').hidden=!kinds.length;
  if(kinds.length) [{name:'',add:0}].concat(kinds).forEach(function(v){
    var b=el('button','choice tile'); b.type='button'; b.setAttribute('aria-pressed',String((selVar||'')===v.name));
    b.appendChild(el('b',null,v.name||'Regular')); b.appendChild(el('span',null,v.add?'+'+money(cents(v.add)):' '));
    b.addEventListener('click',tap(function(){ selVar=v.name||null; }));
    kbox.appendChild(b);
  });
  var xbox=$('extras'); xbox.textContent='';
  var exs=cfg.items.filter(function(x){ return isExtra(x)&&(!x.milkOnly||(chosen&&chosen.milk)); });
  if(!exs.length) xbox.appendChild(el('p','empty','No add-ons.'));
  exs.forEach(function(it){
    var on=selExtras[it.id], b=el('button','choice tile'); b.type='button'; b.disabled=!chosen; b.setAttribute('aria-pressed',String(!!on));
    if(it.options.length) b.setAttribute('aria-expanded',String(openExtra===it.id));
    var picked1=it.options.length&&on&&on!==true?on:'', costC=cents(it.price)+(picked1?cents(optAdd(it,picked1)):0), cost=costC?'+'+money(costC):'';
    b.appendChild(el('b',null,it.name+(it.options.length?' ▾':'')));
    b.appendChild(el('span',null,picked1?picked1+(cost?'  ·  '+cost:''):cost||(it.options.length?'Normal':'Free')));
    b.addEventListener('click',tap(function(){
      if(!sel) return;
      if(it.options.length) openExtra=openExtra===it.id?null:it.id;      /* open its list of choices */
      else selExtras[it.id]=!selExtras[it.id];
    }));
    xbox.appendChild(b);
  });
  /* the list of choices for the add-on that was tapped, such as the syrup flavours */
  var open=openExtra?item(openExtra):null, cbox=$('choices'); cbox.textContent=''; cbox.hidden=!open;
  if(open){
    cbox.appendChild(el('span','label',open.name+':'));
    open.options.concat(selExtras[open.id]?[{name:cents(open.price)?'No '+open.name.toLowerCase():'Normal '+open.name.toLowerCase(),none:true}]:[]).forEach(function(o){
      var none=!!o.none, c=el('button','chip'+(none?' none':''),o.name+(!none&&o.add?'  +'+money(cents(o.add)):'')); c.type='button'; c.setAttribute('aria-pressed',String(!none&&selExtras[open.id]===o.name));
      c.addEventListener('click',tap(function(){ if(none) delete selExtras[open.id]; else selExtras[open.id]=o.name; openExtra=null; }));
      cbox.appendChild(c);
    });
  }
  var picked=chosen?pickedExtras():[], v=chosen?variantOf(chosen,selVar):null;
  var ready=!!chosen&&!!selTemp;
  var selTotal=ready?cents(chosen[selTemp])+(v?cents(v.add):0)+picked.reduce(function(a,e){return a+cents(e.item.price)+cents(optAdd(e.item,e.opt));},0):0;
  $('sel-name').textContent=!chosen?'Nothing selected':(selTemp?drinkName(chosen,selTemp,v):(v?v.name+' ':'')+chosen.name)+(picked.length?' + '+picked.map(function(e){return extraName(e.item,e.opt);}).join(' + '):'');
  $('sel-price').textContent=!chosen?'':!selTemp?'Choose hot or iced':money(selTotal);
  $('add-sel').disabled=!ready;
}
function renderSummary(){
  var lines=cartLines(), ul=$('cart'); ul.textContent='';
  cart=cart.filter(function(c){ return lines.some(function(l){return l.key===c.key;}); });
  if(!lines.length){ discountPct=0; ul.appendChild(el('li','none','Nothing added yet.')); }
  lines.forEach(function(l){
    var li=el('li'), nm=el('span','nm',l.name); nm.appendChild(el('small',null,(l.extras.length?'+ '+l.extras.map(function(e){return e.name;}).join(', ')+'  ·  ':'')+money(cents(l.price))+' each'));
    var q=el('span','qty'), minus=el('button',null,'−'), plus=el('button',null,'+');
    minus.type='button'; plus.type='button'; minus.setAttribute('aria-label','One fewer '+l.name); plus.setAttribute('aria-label','One more '+l.name);
    minus.addEventListener('click',function(){ bump(l.key,-1); }); plus.addEventListener('click',function(){ bump(l.key,1); });
    q.appendChild(minus); q.appendChild(el('b',null,l.qty)); q.appendChild(plus);
    li.appendChild(nm); li.appendChild(q); li.appendChild(el('span',null,money(cents(l.price)*l.qty))); ul.appendChild(li);
  });
  var total=orderTotal(), off=orderDiscount();
  [['disc',10],['disc50',50]].forEach(function(p){ $(p[0]).disabled=!lines.length; $(p[0]).setAttribute('aria-pressed',String(discountPct===p[1])); });
  $('disc-amt').textContent=off?'−'+money(off):'';
  $('total').textContent=money(total); $('pay-total').textContent=money(total); $('pay-amt').textContent=money(total);
  $('pay-ll').textContent=total?'= '+llFmt(total/100*cfg.rate):'';
  $('total-ll').textContent=total?'= '+llFmt(total/100*cfg.rate):'';
  $('pay-open').disabled=!lines.length; $('place').disabled=!lines.length;
  if(!lines.length&&$('paydlg').open) $('paydlg').close();
}
$('add-sel').addEventListener('click',function(){
  var it=sel?item(sel):null; if(!it||!selTemp) return;
  var ex=pickedExtras().map(function(e){return {id:e.id,opt:e.opt};}), line={id:it.id,temp:selTemp,variant:selVar||'',extras:ex};
  sel=null; selTemp=null; selVar=null; openExtra=null; selExtras={}; warned=false; $('flash').hidden=true;
  bump(lineKey(line.id,line.temp,line.variant,ex),1,line);
});
$('back').addEventListener('click',function(){ sel=null; selTemp=null; selVar=null; openExtra=null; selExtras={}; warned=false; renderMenu(); renderSummary(); });
[['disc',10],['disc50',50]].forEach(function(p){ $(p[0]).addEventListener('click',function(){ discountPct=discountPct===p[1]?0:p[1]; warned=false; renderSummary(); }); });
function clearOrder(){ discountPct=0; cart=[]; sel=null; selTemp=null; selVar=null; openExtra=null; selExtras={}; warned=false; ['c-name','c-phone','c-note'].forEach(function(id){$(id).value='';}); renderMenu(); renderSummary(); }
$('clear-cart').addEventListener('click',function(){ $('flash').hidden=true; clearOrder(); });
function flash(msg,err){ var f=$('flash'); f.textContent=msg; f.className='flash'+(err?' err':''); f.hidden=false; }
$('pay-open').addEventListener('click',function(){
  if(!cartLines().length) return;
  var waiting=sel?item(sel):null;
  if(waiting&&!warned){ warned=true; flash(waiting.name+' is open but not added. Tap "Add to order" to include it, or tap "Take payment" again to go on without it.',true); return; }
  $('flash').hidden=true; $('paydlg').showModal();
});
$('pay-back').addEventListener('click',function(){ $('paydlg').close(); });
$('place').addEventListener('click',function(){
  var lines=cartLines(); if(!lines.length) return;
  var total=orderTotal(), subtotal=orderSubtotal(), off=orderDiscount();
  loadAll();
  var today=dayKey(Date.now());
  var n=orders.filter(function(o){return o.day===today;}).reduce(function(m,o){return Math.max(m,Number(o.n)||0);},0)+1;
  var order={id:newId(),n:n,day:today,createdAt:Date.now(),status:'new',
    items:lines.map(function(l){return {name:l.name,price:l.price,qty:l.qty,base:l.base,extras:l.extras,temp:l.temp,variant:l.variant};}),
    subtotal:subtotal/100,discount:off/100,discountPct:off?discountPct:0,total:total/100,method:'mymonty',rate:cfg.rate,
    name:$('c-name').value.trim(),phone:$('c-phone').value.trim(),note:$('c-note').value.trim()};
  if(!addOrder(order)){ $('paydlg').close(); flash('The order was not saved.',true); return; }
  $('paydlg').close(); clearOrder(); renderAll();
  flash('Order #'+n+' sent to the Orders screen. '+money(total)+' by MyMonty.');
});
var payQr=$('pay-qr');
payQr.addEventListener('load',function(){ payQr.hidden=false; });
if(payQr.complete&&payQr.naturalWidth) payQr.hidden=false;
/* tell the layout how tall the top bar is, so the cashier fills exactly one screen */
function fitScreen(){ var bar=document.querySelector('.bar'); if(bar) document.documentElement.style.setProperty('--barh',bar.offsetHeight+'px'); }
window.addEventListener('resize',fitScreen); fitScreen();

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
  var patch=status==='done'?{status:'done',doneAt:Date.now()}:status==='cancelled'?{status:'cancelled',cancelledAt:Date.now()}:{status:'new'};
  askCancel=null;
  if(cloud.on){ shop().collection('orders').doc(id).update(patch).catch(syncErr); return; }
  loadAll(); var o=orders.filter(function(x){return x.id===id;})[0]; if(!o) return;
  Object.assign(o,patch); saveOrders(); renderAll();
}
/* a cancelled order stays in the records and the export, but not in sales, customers or items sold */
function live(o){ return o.status!=='cancelled'; }
var askCancel=null;   /* the order whose Cancel button was tapped once and is waiting for the second tap */
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
    var x=el('button','link cancel',askCancel===o.id?'Tap again to cancel order #'+(Number(o.n)||'?'):'Cancel order'); x.type='button';
    x.addEventListener('click',function(){ if(askCancel===o.id) setStatus(o.id,'cancelled'); else { askCancel=o.id; renderWall(); } }); c.appendChild(x);
    wall.appendChild(c);
  });
  var done=orders.filter(function(o){return o.status==='done'||o.status==='cancelled';}).sort(function(a,b){return (b.doneAt||b.cancelledAt||0)-(a.doneAt||a.cancelledAt||0);}).slice(0,10);
  var dl=$('donelist'); dl.textContent='';
  if(!done.length) dl.appendChild(el('li')).appendChild(el('span',null,'Nothing finished yet.'));
  done.forEach(function(o){
    var gone=o.status==='cancelled', li=el('li'); li.appendChild(el('span',gone?'struck':null,'#'+(Number(o.n)||'?')+'  '+orderText(o)+(o.name?'  ·  '+str(o.name):'')+(gone?'  ·  cancelled':'')));
    var acts=el('span','rowacts');
    var u=el('button','link',gone?'Restore':'Put back'); u.type='button'; u.addEventListener('click',function(){ setStatus(o.id,'new'); }); acts.appendChild(u);
    if(!gone){ var x=el('button','link cancel',askCancel===o.id?'Tap again to cancel':'Cancel'); x.type='button';
      x.addEventListener('click',function(){ if(askCancel===o.id) setStatus(o.id,'cancelled'); else { askCancel=o.id; renderWall(); } }); acts.appendChild(x); }
    li.appendChild(acts); dl.appendChild(li);
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
  var today=dayKey(Date.now()), list=orders.filter(function(o){return o.day===today&&live(o);});
  $('t-orders').textContent=list.length; $('t-sales').textContent=money(list.reduce(function(s,o){return s+cents(o.total);},0));
  $('t-wait').textContent=orders.filter(function(o){return o.status==='new';}).length;
  var drinks=list.reduce(function(s,o){ return s+orderLines(o).reduce(function(a,l){return a+l.qty;},0); },0);
  $('t-split').textContent=drinks+(drinks===1?' item sold today':' items sold today');
  var rows=customers(histList().filter(live).sort(function(a,b){return b.createdAt-a.createdAt;}));
  var tb=$('cust'); tb.textContent='';
  if(!rows.length){ var tr=el('tr'), td=el('td',null,'Customers who give a name or number appear here.'); td.colSpan=3; tr.appendChild(td); tb.appendChild(tr); }
  rows.forEach(function(r){ var tr=el('tr'); tr.appendChild(el('td',null,r.name||'—')); tr.appendChild(el('td',null,r.phone||'—')); tr.appendChild(el('td','num',r.count)); tb.appendChild(tr); });
  $('copy-cust').onclick=function(){
    var text=rows.map(function(r){return r.name+'\t'+r.phone;}).join('\n'), b=$('copy-cust');
    try{ navigator.clipboard.writeText(text).then(function(){b.textContent='Copied';},function(){b.textContent='Copy failed';}); }catch(e){ b.textContent='Copy failed'; }
  };
}
function listText(arr,withPrice){ return (arr||[]).map(function(v){ return withPrice?v.name+(v.add?' +'+v.add:''):v; }).join(', '); }
function parseKinds(t){ return str(t).split(',').map(function(p){ var m=/^(.*?)(?:\s*\+\s*\$?\s*([\d.,]+))?\s*$/.exec(p.trim())||[]; return {name:str(m[1]).trim(),add:Math.max(0,cents(m[2]||0))/100}; }).filter(function(v){return v.name;}); }
function parseChoices(t){ return str(t).split(',').map(function(p){return p.trim();}).filter(Boolean); }
function renderEditor(){
  [[false,'e-items','No drinks yet. Add your first one below.'],[true,'e-extras','No add-ons yet.']].forEach(function(part){
    var extras=part[0], box=$(part[1]); box.textContent='';
    var list=edit.items.filter(function(it){ return isExtra(it)===extras; });
    if(!list.length) box.appendChild(el('p','empty',part[2]));
    list.forEach(function(it){
      var row=el('div',extras?'row extra':'row item'), del=el('button',null,'×');
      var field=function(key,label,aria,wide){ var f=el('input',wide?'wide':null); f.value=it[key]==null||it[key]===''?'':str(it[key]); f.placeholder=label; if(!wide) f.inputMode='decimal'; f.id='e-'+key+'-'+it.id; f.setAttribute('aria-label',aria);
        f.addEventListener('input',function(){ it[key]=f.value; dirty=true; }); return f; };
      var tick=function(key,label){ var l=el('label','chk'), c=el('input'); c.type='checkbox'; c.checked=!!it[key]; c.id='e-'+key+'-'+it.id;
        c.addEventListener('change',function(){ it[key]=c.checked; dirty=true; }); l.appendChild(c); l.appendChild(document.createTextNode(' '+label)); return l; };
      var name=field('name',extras?'Add-on name':'Drink name',extras?'Add-on name':'Drink name',true);
      del.type='button'; del.setAttribute('aria-label','Remove '+str(it.name));
      del.addEventListener('click',function(){ edit.items.splice(edit.items.indexOf(it),1); dirty=true; renderEditor(); });
      row.appendChild(name);
      if(extras){ row.appendChild(field('price','$','Price in dollars')); row.appendChild(field('choicesText','Choices: Vanilla, Caramel','Choices, separated by commas',true)); row.appendChild(tick('milkOnly','Milk drinks only')); }
      else { row.appendChild(field('hot','Hot $','Hot price in dollars')); row.appendChild(field('iced','Iced $','Iced price in dollars')); row.appendChild(field('kindsText','Kinds: Dirty +1, Mango +1','Kinds with extra price, separated by commas',true)); row.appendChild(tick('milk','Has milk')); }
      row.appendChild(del); box.appendChild(row);
    });
  });
}
function addRow(extras){
  edit.items.push(extras?{id:newId(),name:'',price:'',cat:'Extras',choicesText:''}:{id:newId(),name:'',hot:'',iced:'',kindsText:''}); dirty=true; renderEditor();
  var rows=$(extras?'e-extras':'e-items').querySelectorAll('.row'); if(rows.length) rows[rows.length-1].querySelector('input').focus();
}
$('add-item').addEventListener('click',function(){ addRow(false); });
$('add-extra').addEventListener('click',function(){ addRow(true); });
$('e-rate').addEventListener('input',function(){ dirty=true; });
$('save-menu').addEventListener('click',function(){
  var named=edit.items.filter(function(x){return str(x.name).trim();});
  var items=named.filter(function(x){return !isExtra(x);}).map(function(x){ return {id:x.id,name:str(x.name).trim(),hot:priceOrNull(x.hot),iced:priceOrNull(x.iced),milk:!!x.milk,variants:parseKinds(x.kindsText)}; })
    .concat(named.filter(isExtra).map(function(x){ return {id:x.id,name:str(x.name).trim(),price:Math.max(0,cents(x.price))/100,cat:'Extras',milkOnly:!!x.milkOnly,options:parseKinds(x.choicesText)}; }));
  var rate=parseInt(String($('e-rate').value).replace(/[^\d]/g,''),10)||cfg.rate;
  var body={items:items,rate:rate};
  if(writeJSON(K_CFG,body)){ if(cloud.on) shop().collection('config').doc('menu').set(body).catch(syncErr); cfg=cleanMenu(body); dirty=false; loadEditor(); renderAll(); $('save-msg').textContent='Saved. The cashier tab is updated.'; }
  else $('save-msg').textContent='Not saved. This device’s storage is full or blocked.';
});
function loadEditor(){ edit={items:cfg.items.map(function(t){ return isExtra(t)?{id:t.id,name:t.name,price:t.price,cat:'Extras',milkOnly:!!t.milkOnly,choicesText:listText(t.options,true)}:{id:t.id,name:t.name,hot:t.hot,iced:t.iced,milk:!!t.milk,kindsText:listText(t.variants,true)}; })}; $('e-rate').value=cfg.rate; renderEditor(); }

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
    if(live(o)) lines.forEach(function(l){ var ex=l.extras||[]; count(l.name,l.qty,ex.length&&l.base!=null?l.base:l.price); ex.forEach(function(e){ count(e.name,l.qty,e.price); }); });
    return { 'Order':Number(o.n)||'', 'Date':dayKey(d.getTime()), 'Time':('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),
      'Items':lines.map(function(l){return l.qty+'x '+lineText(l);}).join(', '), 'Item count':lines.reduce(function(a,l){return a+l.qty;},0),
      'Subtotal ($)':o.subtotal!=null?Number(o.subtotal)||0:Number(o.total)||0, 'Discount ($)':Number(o.discount)||0, 'Discount %':Number(o.discountPct)||0, 'Total ($)':Number(o.total)||0, 'Paid by':str(o.method), 'Name':str(o.name), 'Phone':str(o.phone), 'Note':str(o.note), 'Status':o.status==='done'?'Done':o.status==='cancelled'?'Cancelled':'Waiting' }; });
  soldRows.sort(function(a,b){return b['Sold']-a['Sold'];});
  var cust=customers(list.filter(live)).map(function(r){return {'Name':r.name,'Phone':r.phone,'Orders':r.count,'Spent ($)':r.spent/100};});
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

/* ---------- devices signed in to sync ---------- */
/* Each signed-in device keeps a small record of itself. Deleting a device's record from Admin
   makes that device sign itself out the next time it is online. */
var K_DEV='apron.till.device', deviceId=readJSON(K_DEV), devices=[], seenSelf=false, beat=null;
if(!deviceId||typeof deviceId!=='string'){ deviceId=newId(); writeJSON(K_DEV,deviceId); }
function deviceLabel(){
  var u=navigator.userAgent, app=window.matchMedia&&matchMedia('(display-mode: standalone)').matches||document.referrer.indexOf('android-app://')===0;
  var kind=/Android/i.test(u)?(/Mobile/i.test(u)?'Android phone':'Android tablet'):/iPad/i.test(u)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'iPad':/iPhone/i.test(u)?'iPhone':/Mac/i.test(u)?'Mac':/Windows/i.test(u)?'Windows PC':'Device';
  return kind+(app?' (app)':' (browser)');
}
function devRef(id){ return shop().collection('devices').doc(id||deviceId); }
function ago(t){ var m=Math.floor((Date.now()-(Number(t)||0))/60000); return m<6?'active now':m<60?m+' min ago':m<1440?Math.floor(m/60)+' h ago':Math.floor(m/1440)+' d ago'; }
function renderDevices(){
  var box=$('dev-box'); box.hidden=!cloud.on; if(!cloud.on) return;
  var list=devices.slice().sort(function(a,b){ return (b.lastSeen||0)-(a.lastSeen||0); });
  $('dev-count').textContent=list.length+(list.length===1?' device is':' devices are')+' signed in to sync';
  var ul=$('dev-list'); ul.textContent='';
  list.forEach(function(d){
    var li=el('li'), mine=d.id===deviceId; li.appendChild(el('span',null,str(d.name)+(mine?'  \u00b7  this device':'')+'  \u00b7  '+ago(d.lastSeen)));
    if(!mine){ var b=el('button','link','Sign out'); b.type='button'; b.addEventListener('click',function(){ devRef(d.id).delete().catch(syncErr); }); li.appendChild(b); }
    ul.appendChild(li);
  });
  $('dev-kick').hidden=list.length<2;
}
$('dev-kick').addEventListener('click',function(){ devices.forEach(function(d){ if(d.id!==deviceId) devRef(d.id).delete().catch(syncErr); }); });

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
  seenSelf=false;
  devRef().set({name:deviceLabel(),signedInAt:Date.now(),lastSeen:Date.now()}).catch(syncErr);
  clearInterval(beat); beat=setInterval(function(){ if(cloud.on&&navigator.onLine) devRef().update({lastSeen:Date.now()}).catch(function(){}); },5*60*1000);
  cloud.unsub.push(shop().collection('devices').onSnapshot(function(snap){
    devices=snap.docs.map(function(d){ return Object.assign({id:d.id},d.data()); });
    var here=devices.some(function(d){return d.id===deviceId;});
    if(here) seenSelf=true;
    else if(seenSelf&&!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites){ seenSelf=false; firebase.auth().signOut(); warn('This device was signed out of sync from Admin on another device.'); return; }
    renderDevices();
  },syncErr));
  var menuRef=shop().collection('config').doc('menu');
  cloud.unsub.push(menuRef.onSnapshot(function(snap){
    if(snap.exists){ cfg=cleanMenu(snap.data()); writeJSON(K_CFG,cfg); if(!dirty) loadEditor(); renderAll(); }
    else if(!snap.metadata.fromCache){ menuRef.set(cfg).catch(syncErr); }
  },syncErr));
}
function goLocal(){
  clearInterval(beat); devices=[]; seenSelf=false;
  cloud.unsub.forEach(function(u){ try{u();}catch(e){} }); cloud.unsub=[]; cloud.on=false; cloud.pending=false; pastOrders=null; loadAll(); renderAll(); renderDevices();
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
$('sync-off').addEventListener('click',function(){
  if(!cloud.ready) return; seenSelf=false;
  var out=function(){ firebase.auth().signOut(); };
  if(cloud.on) devRef().delete().then(out,out); else out();
});
window.addEventListener('online',renderSync); window.addEventListener('offline',renderSync);

/* ---------- boot ---------- */
function renderAll(){ renderMenu(); renderSummary(); renderWall(); renderToday(); }
loadEditor(); renderAll(); renderSync(); renderDevices(); startCloud();
/* a second window on the same device (for example the Orders screen) stays in step */
window.addEventListener('storage',function(e){ if(e.key!==K_ORD&&e.key!==K_CFG) return; loadAll(); if(!dirty) loadEditor(); renderAll(); });
if(!writeJSON('apron.till.probe',1)) warn('This browser is blocking storage, so orders cannot be saved. Leave private browsing mode and reload.');
if('serviceWorker' in navigator && location.protocol.indexOf('http')===0){
  /* when a new version takes over while the app is open, reload to it, unless an order is being built */
  var hadWorker=!!navigator.serviceWorker.controller, reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',function(){ if(hadWorker&&!reloaded&&!cart.length&&!sel){ reloaded=true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').catch(function(){});
}
