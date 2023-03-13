import { config } from "./config.js";
import { ContactInterface, RoomInterface } from "wechaty/impls";
import { Message } from "wechaty";
import {sendMessage} from "./chatgpt.js";
import {insertMessage} from "./mongo.js";
enum MessageType {
  Unknown = 0,

  Attachment = 1, // Attach(6),
  Audio = 2, // Audio(1), Voice(34)
  Contact = 3, // ShareCard(42)
  ChatHistory = 4, // ChatHistory(19)
  Emoticon = 5, // Sticker: Emoticon(15), Emoticon(47)
  Image = 6, // Img(2), Image(3)
  Text = 7, // Text(1)
  Location = 8, // Location(48)
  MiniProgram = 9, // MiniProgram(33)
  GroupNote = 10, // GroupNote(53)
  Transfer = 11, // Transfers(2000)
  RedEnvelope = 12, // RedEnvelopes(2001)
  Recalled = 13, // Recalled(10002)
  Url = 14, // Url(5)
  Video = 15, // Video(4), Video(43)
  Post = 16, // Moment, Channel, Tweet, etc
}

const SINGLE_MESSAGE_MAX_SIZE = 500;
export class ChatGPTBot {
  chatPrivateTiggerKeyword = config.chatPrivateTiggerKeyword;
  chatTiggerRule = config.chatTiggerRule? new RegExp(config.chatTiggerRule): undefined;
  disableGroupMessage = config.disableGroupMessage || false;
  botName: string = "";
  ready = false;
  setBotName(botName: string) {
    this.botName = botName;
  }
  get chatGroupTiggerRegEx(): RegExp {
    return new RegExp(`^@${this.botName}\\s`);
  }
  get chatPrivateTiggerRule(): RegExp | undefined {
    const { chatPrivateTiggerKeyword, chatTiggerRule } = this;
    let regEx = chatTiggerRule
    if (!regEx && chatPrivateTiggerKeyword) {
      regEx = new RegExp(chatPrivateTiggerKeyword)
    }
    return regEx
  }
  async command(): Promise<void> {}
  // remove more times conversation and mention
  cleanMessage(rawText: string, privateChat: boolean = false): string {
    let text = rawText;
    const item = rawText.split("- - - - - - - - - - - - - - -");
    if (item.length > 1) {
      text = item[item.length - 1];
    }
    
    const { chatTiggerRule, chatPrivateTiggerRule } = this;
    
    if (privateChat && chatPrivateTiggerRule) {
      text = text.replace(chatPrivateTiggerRule, "")
    } else if (!privateChat) {
      text = text.replace(this.chatGroupTiggerRegEx, "")
      text = chatTiggerRule? text.replace(chatTiggerRule, ""): text
    }
    // remove more text via - - - - - - - - - - - - - - -
    return text
  }
  async getGPTMessage(text: string,sessionId:string): Promise<string> {
    // console.info('sessionId:',sessionId);
    return await sendMessage(text,sessionId);
  }
  // The message is segmented according to its size
  async trySay(
    talker: RoomInterface | ContactInterface,
    mesasge: string
  ): Promise<void> {
    const messages: Array<string> = [];
    let message = mesasge;
    while (message.length > SINGLE_MESSAGE_MAX_SIZE) {
      messages.push(message.slice(0, SINGLE_MESSAGE_MAX_SIZE));
      message = message.slice(SINGLE_MESSAGE_MAX_SIZE);
    }
    messages.push(message);
    for (const msg of messages) {
      await talker.say(msg);
    }
  }
  // Check whether the ChatGPT processing can be triggered
  tiggerGPTMessage(text: string, privateChat: boolean = false): boolean {
    const { chatTiggerRule } = this;
    let triggered = false;
    if (privateChat) {
      const regEx = this.chatPrivateTiggerRule
      triggered = regEx? regEx.test(text): true;
    } else {
      triggered = this.chatGroupTiggerRegEx.test(text);
      // group message support `chatTiggerRule`
      if (triggered && chatTiggerRule) {
        triggered = chatTiggerRule.test(text.replace(this.chatGroupTiggerRegEx, ""))
      }
    }
    if (triggered) {
      console.log(`🎯 Triggered ChatGPT: ${text}`);
    }
    return triggered;
  }
  // Filter out the message that does not need to be processed
  isNonsense(
    talker: ContactInterface,
    messageType: MessageType,
    text: string
  ): boolean {
    return (
      talker.self() ||
      // TODO: add doc support
      messageType !== MessageType.Text ||
      talker.name() === "微信团队" ||
      // 语音(视频)消息
      text.includes("收到一条视频/语音聊天消息，请在手机上查看") ||
      // 红包消息
      text.includes("收到红包，请在手机上查看") ||
      // Transfer message
      text.includes("收到转账，请在手机上查看") ||
      // 位置消息
      text.includes("/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg")
    );
  }

  async onPrivateMessage(talker: ContactInterface, text: string,timestamp:number|unknown) {
    const talkerId = talker.id;
    insertMessage({talkerId,talkerName:talker.name(),text,timestamp},'single')
    const gptMessage = await this.getGPTMessage(text,talkerId);
    await this.trySay(talker, gptMessage);
  }

  async onGroupMessage(
    talker: ContactInterface,
    text: string,
    room: RoomInterface,
    timestamp:number|unknown
  ) {
    insertMessage({talkerId:talker.id,talkerName:talker.name(),text,roomId:room.id,roomName:room.payload?.topic,timestamp},'groups')
    const gptMessage = await this.getGPTMessage(text,talker.id + room.id);
    const hint = text.length>10?(text.substring(0,9)+'...'):text;
    const result = `@${talker.name()} ${hint}\n >> ${gptMessage}`;
    await this.trySay(room, result);
  }
  async onMessage(message: Message) {
    // console.log(`🎯 ${message.date()} Message: ${message}`);
    console.log(`🎯 ${message.date().toLocaleDateString()} Message: ${message}`);
    // console.log(`🎯 ${message.date().toLocaleDateString()} Message: `,message);
    console.log(`🎯 talker: `, message.talker());// id name
    console.log(`🎯 talker: `, message.talker()?.id);
    console.log(`🎯 talker name: `, message.talker().name(), message.text());
    // console.log(`🎯 room: `, message.room());//  
    console.log(`🎯 room: `, message.room()?.id);//  
    console.log(`🎯 room topic: `, message.room()?.payload?.topic);//  
    const talker = message.talker();
    const rawText = message.text();
    const room = message.room();
    const messageType = message.type();
    const privateChat = !room;
    if (this.isNonsense(talker, messageType, rawText)) {
      return;
    }
    if (this.tiggerGPTMessage(rawText, privateChat)) {
      const text = this.cleanMessage(rawText, privateChat);
      if (privateChat) {
        return await this.onPrivateMessage(talker, text,message.payload?.timestamp);
      } else{
        if (!this.disableGroupMessage){
          return await this.onGroupMessage(talker, text, room,message.payload?.timestamp);
        } else {
          return;
        }
      }
    } else {
      return;
    }
  }
}