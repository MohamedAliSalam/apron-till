var $=function(id){return document.getElementById(id);};
function el(tag,cls,text){var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e;}
function cents(v){var n=parseFloat(String(v).replace(',','.')); return isFinite(n)?Math.round(n*100):0;}
function money(c){c=Math.round(c); return (c<0?'-':'')+'$'+(Math.abs(c)/100).toFixed(Math.abs(c)%100?2:0);}
function dayKey(t){var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function str(v){return v==null?'':String(v);}
function newId(){ return 'i'+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36); }

/* ---------- storage: everything lives on this device ---------- */
var K_CFG='apron.till.menu', K_ORD='apron.till.orders';
var DEFAULT_MENU={tickets:[{id:'shift',name:'Shift',price:5},{id:'double',name:'Double Shift',price:6}],
  addons:[{id:'shot',name:'Extra shot',price:1},{id:'flavour',name:'Flavour',price:1},{id:'matcha',name:'Matcha',price:1}]};
function readJSON(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }
function writeJSON(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } }
function cleanMenu(m){ var ok=function(a){return (Array.isArray(a)?a:[]).filter(function(x){return x&&x.id&&str(x.name).trim();});};
  return {tickets:ok(m&&m.tickets),addons:ok(m&&m.addons)}; }
var cfg, orders;
function loadAll(){
  var m=readJSON(K_CFG); cfg=cleanMenu(m||DEFAULT_MENU);
  var o=readJSON(K_ORD); orders=(Array.isArray(o)?o:[]).filter(function(x){return x&&x.id;});
}
function saveOrders(){ var ok=writeJSON(K_ORD,orders); if(!ok) warn('This tablet could not save the order. Its storage may be full or blocked. Export your orders, then free up space.'); return ok; }
function warn(msg){ var s=$('status'); s.textContent=msg; s.hidden=!msg; }
loadAll();
if(navigator.storage&&navigator.storage.persist){ try{ navigator.storage.persist(); }catch(e){} }

var draft={ticket:null,addons:{},method:'cash'};
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
function ticket(){ return cfg.tickets.filter(function(t){return t.id===draft.ticket;})[0]||null; }
function chosenAddons(){ return cfg.addons.filter(function(a){return draft.addons[a.id];}); }
function orderTotal(){ var t=ticket(); if(!t) return 0; return cents(t.price)+chosenAddons().reduce(function(s,a){return s+cents(a.price);},0); }
function renderChoices(){
  var box=$('tickets'); box.textContent='';
  if(!cfg.tickets.length) box.appendChild(el('p','empty','No tickets yet. Add them in the Admin tab.'));
  cfg.tickets.forEach(function(t){
    var b=el('button','choice'); b.type='button'; b.setAttribute('aria-pressed',String(draft.ticket===t.id));
    b.appendChild(el('b',null,str(t.name))); b.appendChild(el('span',null,money(cents(t.price))));
    b.addEventListener('click',function(){ draft.ticket=t.id; renderChoices(); renderSummary(); });
    box.appendChild(b);
  });
  var ab=$('addons'), btn=$('addbtn'), picked=chosenAddons(); ab.textContent='';
  btn.disabled=!cfg.addons.length;
  $('addbtn-s').textContent=!cfg.addons.length?'None set up yet. Add them in Admin.':picked.length?picked.map(function(a){return str(a.name);}).join(', '):'None. Tap to add.';
  btn.setAttribute('aria-pressed',String(picked.length>0));
  cfg.addons.forEach(function(a){
    var on=!!draft.addons[a.id], b=el('button','addrow'); b.type='button'; b.setAttribute('aria-pressed',String(on));
    b.appendChild(el('span',null,(on?'✓ ':'')+str(a.name))); b.appendChild(el('span',null,'+'+money(cents(a.price))));
    b.addEventListener('click',function(){ draft.addons[a.id]=!draft.addons[a.id]; renderChoices(); renderSummary(); });
    ab.appendChild(b);
  });
}
$('addbtn').addEventListener('click',function(){ var l=$('addons'); l.hidden=!l.hidden; this.setAttribute('aria-expanded',String(!l.hidden)); });
function renderSummary(){
  var t=ticket(), ul=$('lines'); ul.textContent='';
  if(!t){ ul.appendChild(el('li')).appendChild(el('span',null,'Pick a ticket to start')); }
  else{ [t].concat(chosenAddons()).forEach(function(x,i){ var li=el('li'); li.appendChild(el('span',null,(i?'+ ':'')+str(x.name))); li.appendChild(el('span',null,money(cents(x.price)))); ul.appendChild(li); }); }
  var total=orderTotal(); $('total').textContent=money(total);
  var cash=draft.method==='cash'; $('cashbox').hidden=!cash;
  var raw=$('received').value.trim(), rec=raw===''?total:cents(raw), diff=rec-total, box=$('changebox');
  box.className='change'+(diff<0?' owed':diff>0?' back':'');
  $('changelabel').textContent=diff<0?'Still owed':'Change to return';
  $('change').textContent=money(Math.abs(diff));
  $('place').disabled=!t||(cash&&diff<0);
}
$('received').addEventListener('input',renderSummary);
$('quick').addEventListener('click',function(e){ var q=e.target.dataset&&e.target.dataset.q; if(!q) return; $('received').value=q==='exact'?'':q; renderSummary(); });
$('method').addEventListener('click',function(e){ var m=e.target.dataset&&e.target.dataset.m; if(!m) return; draft.method=m;
  [].forEach.call($('method').children,function(b){ b.setAttribute('aria-pressed',String(b.dataset.m===m)); }); renderSummary(); });
function flash(msg,err){ var f=$('flash'); f.textContent=msg; f.className='flash'+(err?' err':''); f.hidden=false; }
$('place').addEventListener('click',function(){
  var t=ticket(); if(!t) return;
  var total=orderTotal(), cash=draft.method==='cash', raw=$('received').value.trim();
  var rec=cash&&raw!==''?cents(raw):total; if(rec<total) return;
  loadAll();
  var today=dayKey(Date.now());
  var n=orders.filter(function(o){return o.day===today;}).reduce(function(m,o){return Math.max(m,Number(o.n)||0);},0)+1;
  orders.push({id:newId(),n:n,day:today,createdAt:Date.now(),status:'new',
    ticket:{name:str(t.name),price:cents(t.price)/100},
    addons:chosenAddons().map(function(a){return {name:str(a.name),price:cents(a.price)/100};}),
    total:total/100,method:draft.method,received:rec/100,change:(rec-total)/100,
    name:$('c-name').value.trim(),phone:$('c-phone').value.trim(),note:$('c-note').value.trim()});
  if(!saveOrders()){ orders.pop(); flash('The order was not saved.',true); return; }
  flash('Order #'+n+' is on the Orders screen.'+(rec>total?' Return '+money(rec-total)+'.':''));
  draft.ticket=null; draft.addons={}; $('addons').hidden=true; $('addbtn').setAttribute('aria-expanded','false');
  ['c-name','c-phone','c-note','received'].forEach(function(id){$(id).value='';});
  renderAll();
});

/* ---------- orders wall ---------- */
function setStatus(id,status){
  loadAll(); var o=orders.filter(function(x){return x.id===id;})[0]; if(!o) return;
  o.status=status; if(status==='done') o.doneAt=Date.now(); saveOrders(); renderAll();
}
function orderLabel(o){ return str(o.ticket&&o.ticket.name)||'Order'; }
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
    c.appendChild(el('div','what',orderLabel(o)));
    var tags=el('div','tags');
    (Array.isArray(o.addons)?o.addons:[]).forEach(function(a){ tags.appendChild(el('span','tag','+ '+str(a&&a.name))); });
    if(!tags.children.length) tags.appendChild(el('span','tag','No add-ons'));
    c.appendChild(tags);
    if(o.note) c.appendChild(el('div','note',str(o.note)));
    var b=el('button','big','Done'); b.type='button'; b.addEventListener('click',function(){ setStatus(o.id,'done'); }); c.appendChild(b);
    wall.appendChild(c);
  });
  var done=orders.filter(function(o){return o.status==='done';}).sort(function(a,b){return (b.doneAt||0)-(a.doneAt||0);}).slice(0,8);
  var dl=$('donelist'); dl.textContent='';
  if(!done.length) dl.appendChild(el('li')).appendChild(el('span',null,'Nothing finished yet.'));
  done.forEach(function(o){
    var li=el('li'); li.appendChild(el('span',null,'#'+(Number(o.n)||'?')+'  '+orderLabel(o)+(o.name?'  ·  '+str(o.name):'')));
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
  var sum=function(arr){return arr.reduce(function(s,o){return s+cents(o.total);},0);};
  $('t-orders').textContent=list.length; $('t-sales').textContent=money(sum(list));
  $('t-wait').textContent=orders.filter(function(o){return o.status==='new';}).length;
  var by=function(m){return money(sum(list.filter(function(o){return o.method===m;})));};
  $('t-split').textContent='Cash '+by('cash')+'  ·  Card '+by('card')+'  ·  Whish '+by('whish');
  var rows=customers(orders.slice().sort(function(a,b){return b.createdAt-a.createdAt;}));
  var tb=$('cust'); tb.textContent='';
  if(!rows.length){ var tr=el('tr'), td=el('td',null,'Customers who give a name or number appear here.'); td.colSpan=3; tr.appendChild(td); tb.appendChild(tr); }
  rows.forEach(function(r){ var tr=el('tr'); tr.appendChild(el('td',null,r.name||'—')); tr.appendChild(el('td',null,r.phone||'—')); tr.appendChild(el('td','num',r.count)); tb.appendChild(tr); });
  $('copy-cust').onclick=function(){
    var text=rows.map(function(r){return r.name+'\t'+r.phone;}).join('\n'), b=$('copy-cust');
    try{ navigator.clipboard.writeText(text).then(function(){b.textContent='Copied';},function(){b.textContent='Copy failed';}); }catch(e){ b.textContent='Copy failed'; }
  };
}
function renderEditor(){
  [['tickets','e-tickets'],['addons','e-addons']].forEach(function(p){
    var box=$(p[1]); box.textContent='';
    if(!edit[p[0]].length) box.appendChild(el('p','empty',p[0]==='tickets'?'No tickets yet. Add your first one below.':'No add-ons yet. Add your first one below.'));
    edit[p[0]].forEach(function(item,i){
      var row=el('div','row'), name=el('input'), price=el('input'), del=el('button',null,'×');
      name.value=str(item.name); name.placeholder='Name'; name.id=p[1]+'-n-'+item.id; name.setAttribute('aria-label','Name');
      price.value=item.price===''?'':str(item.price); price.placeholder='$'; price.inputMode='decimal'; price.id=p[1]+'-p-'+item.id; price.setAttribute('aria-label','Price in dollars');
      name.addEventListener('input',function(){ item.name=name.value; dirty=true; });
      price.addEventListener('input',function(){ item.price=price.value; dirty=true; });
      del.type='button'; del.setAttribute('aria-label','Remove '+str(item.name));
      del.addEventListener('click',function(){ edit[p[0]].splice(i,1); dirty=true; renderEditor(); });
      row.appendChild(name); row.appendChild(price); row.appendChild(del); box.appendChild(row);
    });
  });
}
$('add-ticket').addEventListener('click',function(){ edit.tickets.push({id:newId(),name:'',price:''}); dirty=true; renderEditor(); });
$('add-addon').addEventListener('click',function(){ edit.addons.push({id:newId(),name:'',price:''}); dirty=true; renderEditor(); });
$('save-menu').addEventListener('click',function(){
  var clean=function(arr){ return arr.filter(function(x){return str(x.name).trim();}).map(function(x){return {id:x.id,name:str(x.name).trim(),price:Math.max(0,cents(x.price))/100};}); };
  var body={tickets:clean(edit.tickets),addons:clean(edit.addons)};
  if(writeJSON(K_CFG,body)){ cfg=cleanMenu(body); dirty=false; loadEditor(); renderAll(); $('save-msg').textContent='Saved. The cashier tab is updated.'; }
  else $('save-msg').textContent='Not saved. This tablet’s storage is full or blocked.';
});
function loadEditor(){ edit={tickets:cfg.tickets.map(function(t){return {id:t.id,name:t.name,price:t.price};}),addons:cfg.addons.map(function(a){return {id:a.id,name:a.name,price:a.price};})}; renderEditor(); }

/* ---------- export, backup, reset ---------- */
function saveFile(name,blob){
  var a=document.createElement('a'), url=URL.createObjectURL(blob); a.href=url; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },2000);
}
$('export').addEventListener('click',function(){
  var msg=$('export-msg');
  if(!window.XLSX){ msg.textContent='The Excel export did not load. Reload the app and try again.'; return; }
  var list=orders.slice().sort(function(a,b){return (a.createdAt||0)-(b.createdAt||0);});
  var rows=list.map(function(o){ var d=new Date(Number(o.createdAt)||0); return {
    'Order':Number(o.n)||'', 'Date':dayKey(d.getTime()), 'Time':('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),
    'Ticket':str(o.ticket&&o.ticket.name), 'Add-ons':(Array.isArray(o.addons)?o.addons:[]).map(function(a){return str(a&&a.name);}).join(', '),
    'Total ($)':Number(o.total)||0, 'Paid by':str(o.method), 'Received ($)':Number(o.received)||0, 'Change ($)':Number(o.change)||0,
    'Name':str(o.name), 'Phone':str(o.phone), 'Note':str(o.note), 'Status':o.status==='done'?'Done':'Waiting' }; });
  var cust=customers(list).map(function(r){return {'Name':r.name,'Phone':r.phone,'Orders':r.count,'Spent ($)':r.spent/100};});
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{'Order':'No orders yet'}]),'Orders');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(cust.length?cust:[{'Name':'No customers yet'}]),'Customers');
  var buf=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  saveFile('apron-orders-'+dayKey(Date.now())+'.xlsx',new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  msg.textContent='Exported '+rows.length+' orders.';
});
$('backup').addEventListener('click',function(){
  saveFile('apron-backup-'+dayKey(Date.now())+'.json',new Blob([JSON.stringify({app:'apron-till',savedAt:Date.now(),menu:cfg,orders:orders})],{type:'application/json'}));
  $('backup-msg').textContent='Backup saved with '+orders.length+' orders.';
});
$('restore').addEventListener('change',function(){
  var f=this.files&&this.files[0], input=this; if(!f) return;
  var r=new FileReader();
  r.onload=function(){
    try{
      var d=JSON.parse(r.result); if(!d||d.app!=='apron-till'||!Array.isArray(d.orders)) throw 0;
      var have={}; orders.forEach(function(o){have[o.id]=true;});
      var added=0; d.orders.forEach(function(o){ if(o&&o.id&&!have[o.id]){ orders.push(o); added++; } });
      saveOrders(); renderAll(); $('backup-msg').textContent='Restored '+added+' orders that were not already on this tablet.';
    }catch(e){ $('backup-msg').textContent='That file is not an Apron backup.'; }
    input.value='';
  };
  r.readAsText(f);
});
function wipeUI(open){ $('wipe').hidden=open; $('wipe-yes').hidden=!open; $('wipe-no').hidden=!open; }
$('wipe').addEventListener('click',function(){ wipeUI(true); $('backup-msg').textContent='This removes all '+orders.length+' orders from this tablet and cannot be undone. Export or back up first.'; });
$('wipe-no').addEventListener('click',function(){ wipeUI(false); $('backup-msg').textContent=''; });
$('wipe-yes').addEventListener('click',function(){ orders=[]; saveOrders(); wipeUI(false); renderAll(); $('backup-msg').textContent='All orders deleted.'; });

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
  $('lock-hint').textContent=setting?'Choose a password of at least 4 characters and write it down. It protects prices, the customer list, exports and resets on this tablet.':'Enter the admin password to see sales, customers and the menu.';
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
    if(!writeJSON(K_PASS,{salt:salt,hash:await hashPass(p,salt)})){ msg.textContent='The password could not be saved on this tablet.'; return; }
    changing=false; unlocked=true;
  }else{
    if(await hashPass(p,rec.salt)!==rec.hash){ msg.textContent='Wrong password.'; $('lock-pass').value=''; return; }
    unlocked=true;
  }
  $('lock-pass').value=''; $('lock-pass2').value=''; msg.textContent=''; renderLock();
});
$('lock-now').addEventListener('click',lockAdmin);
$('lock-change').addEventListener('click',function(){ changing=true; renderLock(); $('lock-pass').focus(); });
renderLock();

/* ---------- boot ---------- */
function renderAll(){ renderChoices(); renderSummary(); renderWall(); renderToday(); }
loadEditor(); renderAll();
/* a second window on the same tablet (for example the Orders screen) stays in step */
window.addEventListener('storage',function(e){ if(e.key!==K_ORD&&e.key!==K_CFG) return; loadAll(); if(draft.ticket&&!ticket()) draft.ticket=null; if(!dirty) loadEditor(); renderAll(); });
if(!writeJSON('apron.till.probe',1)) warn('This browser is blocking storage, so orders cannot be saved. Leave private browsing mode and reload.');
if('serviceWorker' in navigator && location.protocol.indexOf('http')===0){ navigator.serviceWorker.register('sw.js').catch(function(){}); }
