const {geocodeRegion,placesForType,routeBetween,kmaForecast}=require('../lib/external');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const out={ok:true,checkedAt:new Date().toISOString(),services:{}};let c;
  try{c=await geocodeRegion('성수');out.services.kakaoLocal={ok:true}}catch(e){out.ok=false;out.services.kakaoLocal={ok:false,error:e.message}}
  if(c){
    try{const ps=await placesForType('성수',c,'카페',2);out.services.kakaoPlaces={ok:ps.length>0,count:ps.length}}catch(e){out.ok=false;out.services.kakaoPlaces={ok:false,error:e.message}}
  }
  try{const r=await routeBetween({x:127.0557,y:37.5446,name:'성수역'},{x:127.0436,y:37.5444,name:'서울숲'},'대중교통');out.services.kakaoTransit={ok:!r.estimated,minutes:r.minutes,source:r.source,warning:r.warning}}catch(e){out.ok=false;out.services.kakaoTransit={ok:false,error:e.message}}
  try{const r=await routeBetween({x:127.0557,y:37.5446,name:'성수역'},{x:127.0436,y:37.5444,name:'서울숲'},'자차');out.services.kakaoMobility={ok:!r.estimated,minutes:r.minutes,source:r.source,warning:r.warning}}catch(e){out.services.kakaoMobility={ok:false,error:e.message}}
  try{const date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);const w=await kmaForecast(37.5446,127.0557,date,'15:00');out.services.kma={ok:w.available,summary:w.summary,temp:w.temp}}catch(e){out.ok=false;out.services.kma={ok:false,error:e.message}}
  res.status(out.ok?200:207).json(out);
}
