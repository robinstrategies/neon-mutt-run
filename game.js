(() => {
  const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const buildings = [
    {x:32,y:34,w:190,h:124,roof:'#c56a65',trim:'#f1a65f',sign:'LO-LUX'}, {x:380,y:32,w:185,h:118,roof:'#6e629b',trim:'#b99cee',sign:'VIDEO'},
    {x:728,y:30,w:195,h:158,roof:'#527b93',trim:'#7ce2db',sign:'SODA'}, {x:35,y:276,w:160,h:164,roof:'#756c5d',trim:'#f0c66e',sign:'MART'},
    {x:382,y:432,w:180,h:130,roof:'#925d7d',trim:'#ff93b1',sign:'TUNES'}, {x:734,y:365,w:185,h:184,roof:'#766b43',trim:'#d5ff69',sign:'ARCADE'}
  ];
  const $ = s => document.querySelector(s);
  const ui = {health:$('#healthBar'),kills:$('#kills'),timer:$('#timer'),score:$('#score'),start:$('#startScreen'),over:$('#gameOver'),result:$('#resultLine'),name:$('#playerName'),board:$('#leaderboard'),note:$('#boardNote')};
  const keys = new Set(); let game, last = 0;
  const demoScores = [{name:'BEEPBOOP',score:12750},{name:'SUGAR RUSH',score:9020},{name:'MOP DOG',score:6440},{name:'TOAST',score:4180}];
  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if([' ','f','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) e.preventDefault(); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('pointerdown', e => {
    if(!game?.alive || !ui.start.classList.contains('hidden')) return;
    const rect=canvas.getBoundingClientRect(), p=game.player;
    p.a=Math.atan2((e.clientY-rect.top)*H/rect.height-p.y,(e.clientX-rect.left)*W/rect.width-p.x);
    fire();
  });

  function reset() {
    game={alive:true,t:0,kills:0,health:100,player:{x:300,y:210,a:0,bonk:0,vehicle:null,fire:0},goons:[],cars:[],bullets:[],particles:[],spawn:1.7};
    for(let i=0;i<5;i++) spawnGoon();
    [['Bubble Bug','#ff6d93',290,205],['Citrus Cab','#ffbd3d',655,285],['Meat Wagon','#cb7bf3',610,405]].forEach((v,i)=>game.cars.push({name:v[0],color:v[1],x:v[2],y:v[3],a:i*.6,occupied:false,life:100}));
    updateHud();
  }
  function spawnGoon() {
    const spots=[[260,190],[620,205],[690,325],[300,500],[570,330],[240,245],[680,245]], p=spots[Math.floor(Math.random()*spots.length)];
    game.goons.push({x:p[0]+(Math.random()-.5)*36,y:p[1]+(Math.random()-.5)*36,hp:1,stun:0,ram:0,color:['#ff8a64','#c57dff','#f0e45d'][Math.floor(Math.random()*3)]});
  }
  function blocked(x,y,r) { return buildings.some(b=>x+r>b.x&&x-r<b.x+b.w&&y+r>b.y&&y-r<b.y+b.h); }
  function move(entity,dx,dy,r) {
    const nx=Math.max(r,Math.min(W-r,entity.x+dx)),ny=Math.max(r,Math.min(H-r,entity.y+dy));
    if(!blocked(nx,entity.y,r)) entity.x=nx;
    if(!blocked(entity.x,ny,r)) entity.y=ny;
  }
  function start() { reset();ui.start.classList.add('hidden');ui.over.classList.add('hidden');last=performance.now();requestAnimationFrame(loop); }
  function loop(now) { if(!game?.alive)return;const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop); }

  function update(dt) {
    const p=game.player; game.t+=dt;game.spawn-=dt;
    if(game.spawn<0){spawnGoon();game.spawn=Math.max(.75,2.25-game.t/260);}
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    if(dx||dy){const l=Math.hypot(dx,dy);dx/=l;dy/=l;p.a=Math.atan2(dy,dx);}
    move(p,dx*(p.vehicle?260:145)*dt,dy*(p.vehicle?260:145)*dt,p.vehicle?21:11);
    if(keys.has('e')&&!p.eLatch){p.eLatch=true;if(p.vehicle){p.vehicle.occupied=false;p.vehicle=null;}else{const car=game.cars.find(c=>!c.occupied&&Math.hypot(c.x-p.x,c.y-p.y)<48);if(car){p.vehicle=car;car.occupied=true;}}}if(!keys.has('e'))p.eLatch=false;
    if(p.vehicle){p.vehicle.x=p.x;p.vehicle.y=p.y;p.vehicle.a=p.a;p.vehicle.life-=dt*1.25;if(p.vehicle.life<=0){p.vehicle.occupied=false;p.vehicle=null;}}
    p.fire-=dt;if(keys.has('f')&&p.fire<=0){fire();p.fire=.16;}
    if(keys.has(' ')&&!p.bonk){p.bonk=.25;bonk();}p.bonk=Math.max(0,p.bonk-dt);
    game.bullets.forEach(b=>{b.life-=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;if(blocked(b.x,b.y,3))b.life=0;game.goons.forEach(g=>{if(b.life>0&&Math.hypot(b.x-g.x,b.y-g.y)<14){g.hp=0;b.life=0;burst(g.x,g.y,g.color);game.kills++;}});});
    game.bullets=game.bullets.filter(b=>b.life>0&&b.x>0&&b.x<W&&b.y>0&&b.y<H);
    game.goons.forEach(g=>{
      const vx=p.x-g.x,vy=p.y-g.y,d=Math.hypot(vx,vy)||1;g.ram-=dt;
      if(p.vehicle&&d<31&&g.ram<=0){g.hp=0;g.ram=.4;burst(g.x,g.y,g.color);game.kills++;p.vehicle.life-=3;return;}
      if(g.stun>0){g.stun-=dt;move(g,-vx/d*80*dt,-vy/d*80*dt,9);}
      else {move(g,vx/d*(28+game.t/70)*dt,vy/d*(28+game.t/70)*dt,9);if(d<23)game.health-=dt*(p.vehicle?.life?.4:1.55);}
    });
    game.goons=game.goons.filter(g=>g.hp>0);game.particles=game.particles.filter(q=>(q.life-=dt)>0);
    if(game.health<=0)end();updateHud();
  }
  function fire(){const p=game.player,nose=p.vehicle?25:13;game.bullets.push({x:p.x+Math.cos(p.a)*nose,y:p.y+Math.sin(p.a)*nose,vx:Math.cos(p.a)*510,vy:Math.sin(p.a)*510,life:.72});}
  function bonk(){const p=game.player,range=p.vehicle?70:42;game.goons.forEach(g=>{if(Math.hypot(g.x-p.x,g.y-p.y)<range){g.hp--;g.stun=.35;burst(g.x,g.y,g.color);if(g.hp<=0)game.kills++;}});}
  function burst(x,y,c){for(let i=0;i<9;i++)game.particles.push({x,y,vx:(Math.random()-.5)*150,vy:(Math.random()-.5)*150,life:.36,c});}
  function end(){game.alive=false;const s=score();ui.result.textContent=`${Math.floor(game.t)} seconds alive · ${game.kills} knockouts · ${s.toLocaleString()} points`;ui.over.classList.remove('hidden');}
  function score(){return Math.floor(game.t*10)+game.kills*500;}
  function updateHud(){if(!game)return;ui.health.style.width=Math.max(0,game.health)+'%';ui.kills.textContent=String(game.kills).padStart(2,'0');ui.timer.textContent=`${String(Math.floor(game.t/60)).padStart(2,'0')}:${String(Math.floor(game.t%60)).padStart(2,'0')}`;ui.score.textContent=String(score()).padStart(5,'0');}

  function draw() {
    ctx.fillStyle='#d8d1ae';ctx.fillRect(0,0,W,H);drawRoads();buildings.forEach(drawBuilding);game.cars.forEach(car);
    game.bullets.forEach(b=>{ctx.strokeStyle='#fff58b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x-b.vx*.018,b.y-b.vy*.018);ctx.lineTo(b.x,b.y);ctx.stroke();});
    game.goons.forEach(g=>person(g.x,g.y,Math.atan2(game.player.y-g.y,game.player.x-g.x),g.color,'#27324a'));
    const p=game.player;if(p.bonk){ctx.strokeStyle='#d9ff5c';ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.x,p.y,p.vehicle?55:35,p.a-.72,p.a+.72);ctx.stroke();}
    if(!p.vehicle)person(p.x,p.y,p.a,'#44d6d0','#ffcc69');
    game.particles.forEach(q=>{ctx.fillStyle=q.c;ctx.fillRect(q.x+=q.vx*.016,q.y+=q.vy*.016,4,4);});
  }
  function drawRoads() {
    ctx.fillStyle='#4c506c';ctx.fillRect(0,165,W,94);ctx.fillRect(0,445,W,90);ctx.fillRect(225,0,132,H);ctx.fillRect(575,0,138,H);
    ctx.fillStyle='#31384f';ctx.fillRect(0,207,W,10);ctx.fillRect(0,482,W,10);ctx.fillRect(285,0,10,H);ctx.fillRect(635,0,10,H);
    ctx.strokeStyle='#f4c450';ctx.lineWidth=3;ctx.setLineDash([17,17]);[[0,212,W,212],[0,487,W,487],[290,0,290,H],[640,0,640,H]].forEach(r=>{ctx.beginPath();ctx.moveTo(r[0],r[1]);ctx.lineTo(r[2],r[3]);ctx.stroke();});ctx.setLineDash([]);
  }
  function drawBuilding(b) {
    ctx.fillStyle='#263247';ctx.fillRect(b.x+6,b.y+8,b.w,b.h);ctx.fillStyle=b.roof;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle=b.trim;ctx.fillRect(b.x,b.y,b.w,7);
    for(let x=b.x+15;x<b.x+b.w-11;x+=29)for(let y=b.y+20;y<b.y+b.h-12;y+=24){ctx.fillStyle='#263247';ctx.fillRect(x,y,16,11);ctx.fillStyle='#77cbd1';ctx.fillRect(x+2,y+2,12,6);}
    ctx.fillStyle='#f8e378';ctx.fillRect(b.x+b.w/2-28,b.y+b.h-18,56,15);ctx.fillStyle='#283144';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText(b.sign,b.x+b.w/2,b.y+b.h-7);ctx.textAlign='start';
  }
  function person(x,y,a,jacket,hair) {
    ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle='rgba(26,39,53,.32)';ctx.beginPath();ctx.ellipse(2,8,9,4,0,0,7);ctx.fill();
    ctx.fillStyle='#243148';ctx.fillRect(-6,-1,5,10);ctx.fillRect(3,-1,5,10);ctx.fillStyle=jacket;ctx.fillRect(-7,-8,14,14);
    ctx.fillStyle='#ffbd84';ctx.fillRect(5,-5,7,4);ctx.fillRect(-12,-5,7,4);ctx.beginPath();ctx.arc(0,-12,6,0,7);ctx.fill();ctx.fillStyle=hair;ctx.fillRect(-6,-17,12,5);ctx.fillRect(3,-13,4,4);ctx.restore();
  }
  function car(c) {
    ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.a);ctx.fillStyle='rgba(21,31,47,.32)';ctx.fillRect(-19,-10,45,27);ctx.fillStyle='#243148';ctx.fillRect(-25,-15,50,30);
    ctx.fillStyle=c.color;ctx.fillRect(-22,-12,44,24);ctx.fillStyle='#ffde7c';ctx.fillRect(-22,-9,4,7);ctx.fillRect(-22,3,4,7);ctx.fillStyle='#213349';ctx.fillRect(-5,-10,16,20);ctx.fillStyle='#9be7e1';ctx.fillRect(-2,-8,10,16);ctx.fillStyle='#f9edf0';ctx.fillRect(13,-7,5,14);ctx.restore();
  }
  function renderBoard(rows,remote=false){ui.board.innerHTML=rows.slice(0,5).map((s,i)=>`<li><span class="rank">${String(i+1).padStart(2,'0')}</span><b>${safe(s.name||'RASCAL')}</b><em>${Number(s.score).toLocaleString()}</em></li>`).join('');ui.note.textContent=remote?'Global scores · point total blends time alive and knockouts.':'Local demo scores are shown until Supabase is connected.';}
  function safe(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function leaderboard(){const c=window.NEON_MUTT_SUPABASE||{};if(!c.url||!c.anonKey){renderBoard(demoScores);return;}try{const r=await fetch(`${c.url}/rest/v1/scores?select=name,score,kills,survival_seconds&order=score.desc&limit=5`,{headers:{apikey:c.anonKey,Authorization:`Bearer ${c.anonKey}`}});if(!r.ok)throw Error();renderBoard(await r.json(),true);}catch{renderBoard(demoScores);ui.note.textContent='Could not reach the live board. Showing demo scores.';}}
  async function submit(){if(!game)return;const name=(ui.name.value.trim()||'RASCAL').toUpperCase(),entry={name,score:score(),kills:game.kills,survival_seconds:Math.floor(game.t)},c=window.NEON_MUTT_SUPABASE||{};if(c.url&&c.anonKey){try{await fetch(`${c.url}/rest/v1/scores`,{method:'POST',headers:{apikey:c.anonKey,Authorization:`Bearer ${c.anonKey}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(entry)});}catch{}}else demoScores.push(entry);await leaderboard();$('#submitScore').textContent='POSTED!';}
  $('#startButton').onclick=start;$('#againButton').onclick=start;$('#submitScore').onclick=submit;$('#refreshBoard').onclick=leaderboard;$('#helpButton').onclick=()=>$('#helpDialog').showModal();$('#closeHelp').onclick=()=>$('#helpDialog').close();
  document.querySelectorAll('[data-key]').forEach(button=>{const key=button.dataset.key,down=e=>{e.preventDefault();keys.add(key);},up=e=>{e.preventDefault();keys.delete(key);};button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointerleave',up);button.addEventListener('pointercancel',up);});
  renderBoard(demoScores);reset();draw();
})();
