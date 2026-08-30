const KAKAO_LOCAL = 'https://dapi.kakao.com';
const KAKAO_NAVI = 'https://apis-navi.kakaomobility.com';
const KMA = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v.trim();
}

function jsonHeaders() { return {'content-type':'application/json; charset=utf-8'}; }

async function fetchJson(url, options = {}, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {...options, signal: ctrl.signal});
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = {raw:text}; }
    if (!res.ok) {
      const e = new Error(data?.msg || data?.message || data?.error?.message || `HTTP ${res.status}`);
      e.status = res.status; e.data = data; throw e;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function kakaoHeaders(){ return {Authorization:`KakaoAK ${env('KAKAO_REST_API_KEY')}`}; }

async function kakaoKeyword(query, {x,y,radius=3500,size=15,page=1,sort='distance'}={}) {
  const u = new URL(`${KAKAO_LOCAL}/v2/local/search/keyword.json`);
  u.searchParams.set('query', query); u.searchParams.set('size', String(size)); u.searchParams.set('page', String(page));
  if (x && y) { u.searchParams.set('x', String(x)); u.searchParams.set('y', String(y)); u.searchParams.set('radius', String(radius)); u.searchParams.set('sort',sort); }
  const d = await fetchJson(u, {headers:kakaoHeaders()});
  return d.documents || [];
}

async function geocodeRegion(region) {
  const q = region.trim();
  const tries = [q, `${q}역`, `${q} 서울`];
  for (const t of tries) {
    const docs = await kakaoKeyword(t, {size:5});
    if (docs.length) {
      const d = docs[0];
      return {name:d.place_name || q, x:Number(d.x), y:Number(d.y), address:d.road_address_name||d.address_name||'', url:d.place_url||''};
    }
  }
  throw new Error('지역을 찾지 못했어요. 역 이름이나 동 이름으로 다시 입력해주세요.');
}

function normalizePlace(d, type, query) {
  return {
    id:String(d.id||''), type, name:d.place_name, x:Number(d.x), y:Number(d.y),
    address:d.road_address_name||d.address_name||'', phone:d.phone||'', url:d.place_url||'',
    category:d.category_name||'', distance:Number(d.distance||0), source:'kakao', query
  };
}

const queryByType = {
  '식사':['맛집','데이트 맛집','파스타','한식'], '저녁':['맛집','와인바','이자카야','고기집'],
  '카페':['카페','디저트 카페'], '체험':['공방','방탈출','보드게임카페','체험'],
  '전시':['전시','미술관','갤러리'], '쇼핑':['소품샵','편집샵','쇼핑'],
  '산책':['공원','산책','호수공원'], '사진':['사진관','포토부스','전망대']
};

async function placesForType(region, center, type, limit=12) {
  const qs = queryByType[type] || [type];
  const batches = await Promise.all(qs.slice(0,3).map(q => kakaoKeyword(`${region} ${q}`, {x:center.x,y:center.y,radius:4500,size:12}).catch(()=>[])));
  const seen = new Set(), out=[];
  for (let qi=0; qi<batches.length; qi++) for (const d of batches[qi]) {
    if (seen.has(d.id)) continue; seen.add(d.id); out.push(normalizePlace(d,type,qs[qi])); if(out.length>=limit) return out;
  }
  return out;
}

async function kakaoTransit(a,b) {
  const u=new URL(`${KAKAO_LOCAL}/v2/routing/publictraffic`);
  u.searchParams.set('start_x',a.x);u.searchParams.set('start_y',a.y);u.searchParams.set('end_x',b.x);u.searchParams.set('end_y',b.y);
  u.searchParams.set('s_name',a.name||'출발');u.searchParams.set('e_name',b.name||'도착');
  const d=await fetchJson(u,{headers:kakaoHeaders()},10000);
  if(d.status!=='OK'||!d.routes?.length) throw new Error('대중교통 경로를 찾지 못했어요.');
  const r=d.routes.slice().sort((x,y)=>x.properties.totalTime-y.properties.totalTime)[0];
  return {mode:'🚇 대중교통', minutes:Math.max(1,Math.ceil(r.properties.totalTime/60)), cost:(r.properties.fare?.value||0)*2,
    distance:r.properties.totalDistance||0, transfers:r.properties.transfers||0,
    steps:(r.steps||[]).map(s=>({guidance:s.properties?.guidance||'',minutes:Math.ceil((s.properties?.time||0)/60),distance:s.properties?.distance||0,
      vehicles:(s.properties?.vehicles||[]).map(v=>v.name),stops:(s.properties?.stops||[]).map(v=>v.name)})), landingURL:d.properties?.landingURL||'', source:'kakao-publictraffic'};
}

async function kakaoWalk(a,b) {
  const u=new URL(`${KAKAO_LOCAL}/v2/routing/walk`);
  u.searchParams.set('start_x',a.x);u.searchParams.set('start_y',a.y);u.searchParams.set('end_x',b.x);u.searchParams.set('end_y',b.y);
  u.searchParams.set('s_name',a.name||'출발');u.searchParams.set('e_name',b.name||'도착');u.searchParams.set('route_mode','SHORTEST');
  const d=await fetchJson(u,{headers:kakaoHeaders()},10000);
  if(d.status!=='OK'||!d.routes?.length) throw new Error('도보 경로를 찾지 못했어요.');
  const r=d.routes[0]; const p=r.properties||{};
  return {mode:'🚶 도보',minutes:Math.max(1,Math.ceil((p.totalTime||0)/60)),cost:0,distance:p.totalDistance||0,
    steps:(r.steps||[]).map(s=>({guidance:s.properties?.guidance||'',minutes:Math.ceil((s.properties?.time||0)/60),distance:s.properties?.distance||0})),
    landingURL:d.properties?.landingURL||'',source:'kakao-walk'};
}

async function kakaoDrive(a,b,{fuel='GASOLINE',hipass=false}={}) {
  const u=new URL(`${KAKAO_NAVI}/v1/directions`);
  u.searchParams.set('origin',`${a.x},${a.y},name=${a.name||'출발'}`);u.searchParams.set('destination',`${b.x},${b.y},name=${b.name||'도착'}`);
  u.searchParams.set('priority','RECOMMEND');u.searchParams.set('summary','true');u.searchParams.set('car_fuel',fuel);u.searchParams.set('car_hipass',String(hipass));
  const d=await fetchJson(u,{headers:{...kakaoHeaders(),'Content-Type':'application/json'}},10000);
  const r=d.routes?.[0]; if(!r||r.result_code!==0) throw new Error(r?.result_msg||'자동차 경로를 찾지 못했어요.');
  const s=r.summary;
  return {mode:'🚗 자차',minutes:Math.max(1,Math.ceil(s.duration/60)),cost:s.fare?.toll||0,distance:s.distance||0,toll:s.fare?.toll||0,taxi:s.fare?.taxi||0,source:'kakao-mobility'};
}

function haversine(a,b){const R=6371000,toRad=d=>d*Math.PI/180;const p1=toRad(a.y),p2=toRad(b.y),dp=toRad(b.y-a.y),dl=toRad(b.x-a.x);const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}

async function routeBetween(a,b,mode,settings={}) {
  const dist=haversine(a,b);
  if(mode==='도보 위주' || (mode==='알아서' && dist<1100)) return kakaoWalk(a,b);
  if(mode==='자차') {
    try { return await kakaoDrive(a,b,settings); }
    catch(e){ const km=dist/1000; return {mode:'🚗 자차',minutes:Math.max(5,Math.ceil(km/22*60)),cost:0,distance:Math.round(dist),estimated:true,warning:'카카오모빌리티 권한을 확인해주세요.',source:'estimate'}; }
  }
  try { return await kakaoTransit(a,b); }
  catch(e){
    if(dist<2200){ try{return await kakaoWalk(a,b)}catch(_){} }
    const km=dist/1000; return {mode:'🚇 대중교통',minutes:Math.max(8,Math.ceil(km/18*60+6)),cost:3100,distance:Math.round(dist),estimated:true,warning:e.message,source:'estimate'};
  }
}

function toKmaGrid(lat, lon) {
  const RE=6371.00877, GRID=5.0, SLAT1=30.0, SLAT2=60.0, OLON=126.0, OLAT=38.0, XO=43, YO=136, DEGRAD=Math.PI/180.0;
  const re=RE/GRID, slat1=SLAT1*DEGRAD, slat2=SLAT2*DEGRAD, olon=OLON*DEGRAD, olat=OLAT*DEGRAD;
  let sn=Math.tan(Math.PI*0.25+slat2*0.5)/Math.tan(Math.PI*0.25+slat1*0.5);sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/Math.log(sn);
  let sf=Math.tan(Math.PI*0.25+slat1*0.5);sf=Math.pow(sf,sn)*Math.cos(slat1)/sn;
  let ro=Math.tan(Math.PI*0.25+olat*0.5);ro=re*sf/Math.pow(ro,sn);
  let ra=Math.tan(Math.PI*0.25+(lat)*DEGRAD*0.5);ra=re*sf/Math.pow(ra,sn);let theta=lon*DEGRAD-olon;if(theta>Math.PI)theta-=2*Math.PI;if(theta<-Math.PI)theta+=2*Math.PI;theta*=sn;
  return {nx:Math.floor(ra*Math.sin(theta)+XO+0.5),ny:Math.floor(ro-ra*Math.cos(theta)+YO+0.5)};
}

function kstParts(date=new Date()) { const d=new Date(date.getTime()+9*3600000); return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,day:d.getUTCDate(),h:d.getUTCHours(),min:d.getUTCMinutes()}; }
function pad(n){return String(n).padStart(2,'0')}
function latestForecastBase(now=new Date()) {
  const p=kstParts(new Date(now.getTime()-20*60000)); const slots=[2,5,8,11,14,17,20,23]; let h=slots.filter(x=>x<=p.h).pop(); let d=new Date(Date.UTC(p.y,p.m-1,p.day,0,0)-9*3600000);
  if(h==null){ d=new Date(d.getTime()-86400000); h=23; }
  const q=kstParts(d); return {base_date:`${q.y}${pad(q.m)}${pad(q.day)}`,base_time:`${pad(h)}00`};
}

async function kmaForecast(lat,lon,targetDate,targetTime='15:00') {
  const key=decodeURIComponent(env('KMA_SERVICE_KEY')); const {nx,ny}=toKmaGrid(lat,lon); const base=latestForecastBase();
  const u=new URL(KMA);u.searchParams.set('serviceKey',key);u.searchParams.set('pageNo','1');u.searchParams.set('numOfRows','1000');u.searchParams.set('dataType','JSON');u.searchParams.set('base_date',base.base_date);u.searchParams.set('base_time',base.base_time);u.searchParams.set('nx',nx);u.searchParams.set('ny',ny);
  const d=await fetchJson(u,{},10000);const code=d.response?.header?.resultCode;if(code!=='00')throw new Error(d.response?.header?.resultMsg||'기상청 응답 오류');
  const items=d.response?.body?.items?.item||[];if(!items.length)throw new Error('날씨 예보가 없어요.');
  const t=(targetTime||'15:00').replace(':','').slice(0,4);const date=(targetDate||'').replaceAll('-','');
  const candidates=[...new Set(items.filter(x=>x.fcstDate===date).map(x=>x.fcstTime))].sort();
  const chosen=candidates.reduce((best,x)=>Math.abs(Number(x)-Number(t))<Math.abs(Number(best||x)-Number(t))?x:best,candidates[0]);
  const rows=items.filter(x=>x.fcstDate===date&&x.fcstTime===chosen);const map=Object.fromEntries(rows.map(x=>[x.category,x.fcstValue]));
  const sky=map.SKY==='1'?'맑음':map.SKY==='3'?'구름많음':map.SKY==='4'?'흐림':'날씨';
  const pty={0:'',1:'비',2:'비/눈',3:'눈',4:'소나기'}[Number(map.PTY||0)]||'';
  return {available:!!chosen,date:targetDate,time:chosen?`${chosen.slice(0,2)}:${chosen.slice(2)}`:targetTime,temp:map.TMP!=null?Number(map.TMP):null,pop:map.POP!=null?Number(map.POP):null,humidity:map.REH!=null?Number(map.REH):null,sky,precipitation:pty,summary:pty||sky,nx,ny,source:'KMA'};
}

module.exports={jsonHeaders,kakaoKeyword,geocodeRegion,placesForType,routeBetween,kmaForecast,haversine};
