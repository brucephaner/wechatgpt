import { MongoClient } from "mongodb";
import { config } from "./config.js";

// or as an es module:
// import { MongoClient } from 'mongodb'

// Connection URL
// const url = 'mongodb://localhost:27017';
const client = new MongoClient(config.mongoUrl);

// Database Name
const dbName = "wechat_group";
//start once on server boot
export async function connect() {
  try {
    // Use connect method to connect to the server
    await client.connect();
    console.log("mongo Connected  to server");
  } catch (error) {
    console.info("mongodb error: ", error);
    client.close();
  }
}
function collections(name:string) {
  const db = client.db(dbName);
  const collection = db.collection(name);
  return collection;
}

export async function insertMessage(json:{},collectionName:string='others') {
  //  const stamp = Math.floor(Date.now()/1000);
  const result = await collections(collectionName).insertOne({...json });
  // the following code examples can be pasted here...
  console.info("insertMessage", result);
  return result?.acknowledged;
}

interface MyError {
  code?: string;
  msg?: string;
};
export async function insertError(json:MyError,collectionName:string='gpterrors') {
    const stamp = Math.floor(Date.now()/1000);
  const result = await collections(collectionName).insertOne({stamp, ...json });
  // the following code examples can be pasted here...
  console.info("insertMessage", result);
  return result?.acknowledged;
}

async function main() {
  // Use connect method to connect to the server
  await client.connect();
  console.log("Connected successfully to server");
  const db = client.db(dbName);
  const collection = db.collection("others");
  const docs = await collection.find().toArray();
  // the following code examples can be pasted here...
  console.info("docs", docs);
  return "done.";
}

// insertMessage({topic:"test"})
//   .then(console.log)
//   .catch(console.error)
//   .finally(() => client.close());
