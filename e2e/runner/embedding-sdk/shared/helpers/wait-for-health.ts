import { delay } from "../../../cypress-runner-utils";

const HEALTH_CHECK_ATTEMPTS_COUNT = 60 * 5;
const HEALTH_CHECK_WAIT_TIME_MS = 2000;

export async function waitForHealth(url: string, identifier: string) {
  for (let i = 0; i < HEALTH_CHECK_ATTEMPTS_COUNT; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`${identifier} is ready`);
        return;
      }
    } catch {}

    console.log("Initializing App...");
    await delay(HEALTH_CHECK_WAIT_TIME_MS);
  }

  throw new Error("App is not ready");
}
