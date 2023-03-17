import {config} from "./config.js";
import {insertError} from "./mongo.js";
import fetch from "node-fetch";

let apiKey = config.openai_api_key;
let model = config.model;
//id: talkerId || talkerId + roomId

const context = new Map();



const buildSysterm = (message: string,sessionId:string) => {
   const command = message.trim();
  if(command=='正常模式'){
    context.delete(sessionId)
    context.delete(sessionId+'mode')
    return 200;
  }else if(command.startsWith('扮演模式 ')){
    context.delete(sessionId)
    context.set(sessionId+'mode',{"role": "system", "content":command.substring(5)})
    return 200;
  }else if(command.startsWith('翻译模式 ')){
    context.delete(sessionId)
    context.set(sessionId+'mode',{"role": "system", "content":`你是一个优秀的${command.substring(5)}翻译，要求仅输出翻译结果`})
    return 200;
  } 
  return 0;
}


const buildMessages = (message: string,sessionId:string) => {
  let messages  = context.get(sessionId);
  let system  = context.get(sessionId+'mode')
  if(!messages){
    messages = [];
    context.set(sessionId, messages);
  }
  messages.push({role:'user',content:message});

  let contentLength = 0;
  for (let i = 0; i < messages.length; i++) {
    const element = messages[i];
    contentLength += element.content.length;
  }
  //一个中文占1.5token左右,一次访问只能带4096token
  const promptTokenLimit = system?2300:1000;
  while(contentLength > promptTokenLimit) {
    if(messages.length===1) break;
    messages.shift();
    contentLength =0;
    for (let y = 0; y < messages.length; y++) {
      const elementy = messages[y];
      contentLength += elementy.content.length;
    }
  }
  console.info('contentLength: ',contentLength);
  console.info('messages Length: ',messages.length);
  if(system) messages.unshift(system);
  return messages;
}
const sendMessage = async (message: string,sessionId:string) => {

  try {
    if(context.size>10000){
      context.clear();
    }

    const code = buildSysterm(message,sessionId);
    if(code === 200) return '模式已切换✅';

    let messages  = buildMessages(message,sessionId)

    // console.info('before ask',messages);
    console.info('ask///////',message);
    const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages,
        temperature: 0.6
      }),
    });
    return response.json()
      .then((data) => 
      {
        // @ts-ignore
        let content = data.choices[0].message.content;
        messages.push({role:'assistant',content});
        // @ts-ignore
        console.info('data---',data?.usage);
        console.info('answer---',content);
        return content;
      });
  } catch (err) {
    console.error(err)
    insertError({msg:'chat gpt failed'})
    return "try again later!"
  }
}
//\n\n作为AI助手，我不知道您想表达什么，请再提供更多上下文信息。


export {sendMessage};