const {generatePlan}=require('../lib/planner');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  try{const plan=typeof req.body==='string'?JSON.parse(req.body):req.body||{};if(!plan.region||!plan.date||!plan.start||!plan.end)return res.status(400).json({error:'지역·날짜·시간이 필요해요.'});const data=await generatePlan(plan,plan.settings||{});return res.status(200).json(data)}
  catch(e){console.error('plan error',e.message);return res.status(e.status||500).json({error:e.message||'코스 생성 중 오류가 발생했어요.'})}
}
