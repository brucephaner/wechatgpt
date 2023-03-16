import {config} from "./config.js";
import {insertError} from "./mongo.js";
import fetch from "node-fetch";

let apiKey = config.openai_api_key;
let model = config.model;
//id: talkerId || talkerId + roomId

const context = new Map();



const buildSysterm = (message: string,sessionId:string) => {
   
  if(message.trim()=='正常模式'){

    context.delete(sessionId+'mode')
    return 200;
  }else if(message.startsWith('扮演模式 ')){
    
    context.set(sessionId+'mode',{"role": "system", "content":message.substring(5)})
    return 200;
  }else if(message.startsWith('翻译模式 ')){
    context.set(sessionId+'mode',{"role": "system", "content":`你是一个优秀的${message.substring(5)}翻译，要求仅输出翻译结果`})
    return 200;
  } 

  return 0;
}
const sendMessage = async (message: string,sessionId:string) => {

  try {
    if(context.size>10000){
      context.clear();
    }


    const code = buildSysterm(message,sessionId);
    if(code === 200) return '模式已切换✅';

    let messages  = context.get(sessionId);
    let system  = context.get(sessionId+'mode')
    if(!messages){
      messages = [];
      context.set(sessionId, messages);
    }
    messages.push({role:'user',content:message});
    while(messages.length > 3) {
      messages.shift();
    }
    if(system) messages.unshift(system);

    console.info('before ask',messages);
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
        console.info('answer---',content);
        return content;
      });
  } catch (err) {
    console.error(err)
    insertError({msg:'chat gpt failed'})
    return "try again later!"
  }
}

export {sendMessage};