const {geocodeRegion,placesForType}=require('../lib/external');
const {estimateCost}=require('../lib/planner');
const emoji={식사:'🍽️',저녁:'🍷',카페:'☕',체험:'🎨',전시:'🖼️',쇼핑:'🛍️',산책:'🌿',사진:'📸'};
const duration={식사:65,저녁:80,카페:55,체험:75,전시:70,쇼핑:45,산책:40,사진:45};
module.exports=async function handler(req,res){res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');try{const region=String(req.query.region||'').trim(),type=String(req.query.type||'카페');if(!region)return res.status(400).json({error:'region required'});const center=await geocodeRegion(region);const raw=await placesForType(region,center,type,15);const places=raw.map(p=>({...p,emoji:emoji[type]||'📍',duration:duration[type]||60,cost:estimateCost(p,type,'best'),indoor:type!=='산책'}));res.status(200).json({center,places})}catch(e){res.status(e.status||500).json({error:e.message})}}
