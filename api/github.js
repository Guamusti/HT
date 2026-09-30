// Vercel Node function: only public GitHub endpoints, no user tokens stored.
export default async function handler(req,res) {
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método no permitido.'});}
 const username=String(req.query.username||''),since=String(req.query.since||'');
 if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username))return res.status(400).json({error:'Usuario de GitHub no válido.'});
 const date=new Date(since),now=new Date();
 if(!Number.isFinite(+date)||date>now||date<new Date('1970-01-01'))return res.status(400).json({error:'Fecha de inicio no válida.'});
 const warnings=[],records=[],deadline=Date.now()+45000;
 const headers={Accept:'application/vnd.github+json','User-Agent':'HT-Personal-Progress','X-GitHub-Api-Version':'2026-03-10'};
 async function github(path){
  const result=await fetch('https://api.github.com'+path,{headers,signal:AbortSignal.timeout(Math.max(1,Math.min(12000,deadline-Date.now())))});
  if(!result.ok){const err=new Error(result.status===403||result.status===429?'GitHub ha alcanzado su límite de consultas públicas. Inténtalo más tarde.':result.status===404?'Usuario o recurso público no encontrado.':`GitHub respondió ${result.status}.`);err.status=result.status;throw err;}
  return {data:await result.json(),more:!!result.headers.get('link')?.includes('rel="next"')};
 }
 try{
  const reposResponse=await github(`/users/${encodeURIComponent(username)}/repos?sort=pushed&direction=desc&per_page=30&type=owner`);
  const all=reposResponse.data.filter(r=>!r.fork),repos=all.slice(0,12);
  if(reposResponse.more||all.length>12)warnings.push('Se han limitado los repositorios a los 12 más recientes; no se importan forks ni organizaciones.');
  for(const repo of repos){if(repo.created_at>=date.toISOString()&&repo.created_at<=now.toISOString())records.push({title:`Repositorio creado: ${repo.name}`.slice(0,180),source:'github',xp:20,occurredAt:repo.created_at,evidence:repo.html_url,externalKeys:[`github:repo:${repo.id}`],externalKind:'repository'});}
  // Batch three independent upstream requests; bounded to avoid overwhelming GitHub.
  for(let i=0;i<repos.length;i+=3){if(Date.now()>=deadline){warnings.push('Se alcanzó el límite de tiempo; algunos repositorios quedaron sin consultar.');break;}const results=await Promise.allSettled(repos.slice(i,i+3).map(async repo=>{const result=await github(`/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(date.toISOString())}&until=${encodeURIComponent(now.toISOString())}&per_page=100`);return {repo,...result};}));for(let j=0;j<results.length;j++){const result=results[j];if(result.status==='rejected'){warnings.push(`Commits omitidos en ${repos[i+j].name}: ${result.reason.message}`);continue;}const {repo,data,more}=result.value;if(more)warnings.push(`${repo.name}: sólo primeros 100 commits de la rama principal.`);for(const c of data){const occurredAt=c.commit.author?.date||c.commit.committer?.date;if(!occurredAt||occurredAt<date.toISOString()||occurredAt>now.toISOString())continue;records.push({title:`${repo.name}: ${c.commit.message.split('\n')[0]}`.slice(0,180),description:`Commit ${c.sha}`,source:'github',xp:5,occurredAt,evidence:c.html_url,externalKeys:[`github:commit:${c.sha}`],externalKind:'commit'});}}}
  try{const result=await github(`/search/issues?q=${encodeURIComponent(`author:${username} type:pr is:public created:>=${date.toISOString().slice(0,10)}`)}&per_page=100&sort=created&order=desc`);if(result.more||result.data.incomplete_results)warnings.push('Pull requests: resultados limitados o incompletos.');for(const pr of result.data.items){if(pr.created_at<date.toISOString()||pr.created_at>now.toISOString())continue;records.push({title:`PR #${pr.number}: ${pr.title}`.slice(0,180),source:'github',xp:15,occurredAt:pr.created_at,evidence:pr.html_url,externalKeys:[`github:pr:${pr.id}`],externalKind:'pull_request'});}}catch(err){warnings.push('Pull requests: '+err.message);}
  res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=300');
  return res.status(200).json({records,message:`${records.length} evidencias públicas encontradas. Commits de la rama principal, autor ${username}. ${warnings.join(' ')}`});
 }catch(error){return res.status(error.status===404?404:502).json({error:error.message});}
}
