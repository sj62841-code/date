const {geocodeRegion,placesForType,routeBetween,kmaForecast,haversine} = require('./external');

function hash(s=''){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)}
function estimateCost(place,type,style='best'){
  const ranges={식사:[26000,52000],저녁:[36000,70000],카페:[12000,26000],체험:[24000,60000],전시:[0,36000],쇼핑:[0,15000],산책:[0,0],사진:[8000,30000]};
  let [lo,hi]=ranges[type]||[10000,30000];if(hi===0)return 0;let n=lo+(hash(place.name)%(Math.max(1000,hi-lo+1)));n=Math.round(n/1000)*1000;
  if(style==='budget')n=Math.round(Math.max(lo,n*.8)/1000)*1000;if(style==='special'&&['식사','저녁','체험'].includes(type))n=Math.round(Math.min(hi*1.2,n*1.15)/1000)*1000;return n;
}
function durationFor(type){return {식사:65,저녁:80,카페:55,체험:75,전시:70,쇼핑:45,산책:40,사진:45}[type]||60}
function emoji(type){return {식사:'🍽️',저녁:'🍷',카페:'☕',체험:'🎨',전시:'🖼️',쇼핑:'🛍️',산책:'🌿',사진:'📸'}[type]||'📍'}
function indoor(type){return !['산책'].includes(type)}
function diffMin(a,b){const [ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number);let d=bh*60+bm-(ah*60+am);if(d<=0)d+=1440;return d}
function addMin(t,m){let [h,n]=t.split(':').map(Number);let x=h*60+n+m;return `${String(Math.floor(x/60)%24).padStart(2,'0')}:${String(x%60).padStart(2,'0')}`}
function typesFor(plan,style,weather){const mins=diffMin(plan.start,plan.end);let t=mins<=240?['식사','체험','카페']:mins<=360?['식사','체험','카페','산책']:['식사','체험','카페','저녁','산책'];
  if(style==='budget'){const b=Number(plan.budget)||100000;t=mins<=240?['식사','카페','산책']:b<=100000?['식사','쇼핑','카페','산책']:mins<=360?['식사','쇼핑','카페','산책']:['식사','쇼핑','카페','저녁','산책'];}
  if(plan.moods?.includes('전시'))t=t.map((x,i)=>i===1?'전시':x);if(plan.moods?.includes('쇼핑')&&t.length>3)t[t.length-2]='쇼핑';if(plan.moods?.includes('사진')&&t.length>3)t[1]='사진';
  const badWeather=weather&&(weather.precipitation||weather.pop>=60||weather.temp>=31||weather.temp<=0);if(plan.vibes?.includes('실내')||badWeather)t=t.map(x=>x==='산책'?'전시':x);
  return [...new Set(t)];
}
function scoreCandidate(p,prev,style,used){let s=100;if(used.has(p.id))s-=1000;if(prev)s-=Math.min(60,haversine(prev,p)/100);else s-=Math.min(30,p.distance/150);if(style==='special'&&(p.query?.includes('공방')||p.query?.includes('갤러리')))s+=25;if(style==='budget'&&(p.query?.includes('맛집')||p.query?.includes('카페')))s+=8;return s+(hash(p.name)%13)}
function pick(cands,prev,style,used){return cands.slice().sort((a,b)=>scoreCandidate(b,prev,style,used)-scoreCandidate(a,prev,style,used))[0]}
function fuelCost(distanceMeters,settings){const km=distanceMeters/1000,e=Number(settings?.fuelEfficiency)||11.5,p=Number(settings?.fuelPrice)||1680;return Math.round((km/e*p)/10)*10}
async function composeCourse(style, plan, center, weather, pool, settings){
  const types=typesFor(plan,style,weather), used=new Set(), stops=[];let prev=null;
  for(const type of types){const cands=pool[type]||[];if(!cands.length)continue;const p=pick(cands,prev,style,used);if(!p)continue;used.add(p.id);stops.push({...p,emoji:emoji(type),duration:durationFor(type),cost:estimateCost(p,type,style),indoor:indoor(type)});prev=p;}
  if(stops.length<2) throw new Error('선택한 지역에서 데이트 장소를 충분히 찾지 못했어요.');
  const moves=[];for(let i=0;i<stops.length-1;i++){let m;try{m=await routeBetween(stops[i],stops[i+1],plan.transport,settings)}catch(e){const dist=haversine(stops[i],stops[i+1]);m={mode:plan.transport==='자차'?'🚗 자차':plan.transport==='도보 위주'?'🚶 도보':'🚇 대중교통',minutes:Math.max(5,Math.ceil(dist/(plan.transport==='도보 위주'?70:250))),cost:0,distance:Math.round(dist),estimated:true,warning:e.message,source:'estimate'}}if(plan.transport==='자차')m.fuelCost=fuelCost(m.distance||0,settings),m.cost=(m.cost||0)+m.fuelCost;moves.push(m)}
  const target=diffMin(plan.start,plan.end), moveM=moves.reduce((s,x)=>s+x.minutes,0), available=Math.max(90,target-moveM);let stopM=stops.reduce((s,x)=>s+x.duration,0);
  if(stopM>available){let over=stopM-available;for(let i=stops.length-1;i>=0&&over>0;i--){const cut=Math.min(over,Math.max(0,stops[i].duration-35));stops[i].duration-=cut;over-=cut}}else if(available-stopM>25)stops[stops.length-1].duration+=Math.min(50,available-stopM);
  let t=plan.start,totalCost=0;for(let i=0;i<stops.length;i++){stops[i].start=t;stops[i].end=addMin(t,stops[i].duration);t=stops[i].end;totalCost+=stops[i].cost;if(moves[i]){moves[i].from=t;moves[i].to=addMin(t,moves[i].minutes);t=moves[i].to;totalCost+=moves[i].cost||0}}
  return {id:`api_${style}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,style,region:plan.region,date:plan.date,start:plan.start,end:t,stops,moves,totalCost,moveMinutes:moves.reduce((s,x)=>s+x.minutes,0),totalDuration:diffMin(plan.start,t),score:style==='best'?96:style==='budget'?91:88,
    title:style==='best'?`${plan.region}에서 딱 좋은 하루`:style==='budget'?'부담 없이 알차게':'오늘은 평소와 다르게',
    desc:style==='best'?'실제 장소와 이동 경로를 기준으로 균형 있게 구성했어요.':style==='budget'?'무료·저비용 장소 비중과 짧은 이동을 우선했어요.':'평소보다 새로운 체험과 장소를 우선했어요.',weather,liveData:true};
}

async function generatePlan(plan,settings={}){
  const center=await geocodeRegion(plan.region);let weather=null;try{weather=await kmaForecast(center.y,center.x,plan.date,plan.start)}catch(e){weather={available:false,error:e.message};}
  const styles=['best','budget','special'];const needed=new Set();for(const s of styles)typesFor(plan,s,weather).forEach(x=>needed.add(x));
  const pairs=await Promise.all([...needed].map(async type=>[type,await placesForType(plan.region,center,type,12).catch(()=>[])]));const pool=Object.fromEntries(pairs);
  const courses=[];for(const s of styles){try{courses.push(await composeCourse(s,plan,center,weather,pool,settings))}catch(e){/* one style may fail */}}
  if(!courses.length)throw new Error('실제 장소 데이터로 코스를 만들지 못했어요. 지역명을 조금 더 구체적으로 입력해주세요.');
  return {center,weather,courses,source:{places:'Kakao Local',transit:'Kakao Map Routing',driving:'Kakao Mobility',weather:'KMA'},generatedAt:new Date().toISOString()};
}
module.exports={generatePlan,estimateCost};
