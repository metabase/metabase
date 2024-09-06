import * as rrweb from "@rrweb/record";
import { openDB } from "idb";

const DB_NAME = "RRWebEvents";
const STORE_NAME = "events";

let events = [];
let xhrEvents = [];

async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { autoIncrement: true });
    },
  });
}

async function saveEvents(eventsToSave) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  for (const event of eventsToSave) {
    await store.add(event);
  }
  await tx.done;
}

function recordXHR() {
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (...args) {
    this._requestData = {
      method: args[0],
      url: args[1],
      timestamp: Date.now(),
    };
    originalXHROpen.apply(this, args);
  };

  XMLHttpRequest.prototype.send = function (data) {
    if (this._requestData) {
      this._requestData.data = data;

      this.addEventListener("load", function () {
        const xhrEvent = {
          type: "xhr",
          request: this._requestData,
          response: {
            status: this.status,
            statusText: this.statusText,
            responseText: this.responseText,
          },
          timestamp: Date.now(),
        };
        xhrEvents.push(xhrEvent);
      });
    }
    originalXHRSend.apply(this, arguments);
  };
}

export async function initRRWebRecorder() {
  rrweb.record({
    emit(event) {
      events.push(event);
    },
  });

  recordXHR();

  async function saveToIndexedDB() {
    if (events.length > 0 || xhrEvents.length > 0) {
      await saveEvents([...events, ...xhrEvents]);
      events = [];
      xhrEvents = [];
    }
  }

  setInterval(saveToIndexedDB, 10 * 1000);
}

export async function getAllEvents() {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}
