import { setTimeout as sleep } from "node:timers/promises";

import { createWritableDb } from "./db_tasks";

const DB_TYPES = ["postgres", "mysql"] as const;
const MAX_ATTEMPTS = 60;
const RETRY_DELAY_MS = 2000;

async function createWithRetry(type: (typeof DB_TYPES)[number]) {
  for (let attempt = 1; ; attempt++) {
    try {
      await createWritableDb({ type });
      console.log(`writable_db is ready in ${type}`);
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw error;
      }
      console.log(
        `${type} is not ready (attempt ${attempt}/${MAX_ATTEMPTS}), retrying`,
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
}

try {
  for (const type of DB_TYPES) {
    await createWithRetry(type);
  }
  process.exit(0);
} catch (error) {
  console.error("Could not create writable_db in the QA databases", error);
  process.exit(1);
}
