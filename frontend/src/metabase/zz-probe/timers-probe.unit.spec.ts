import { setTimeout as nodeSetTimeout } from "node:timers";

it("checks that React's scheduler still runs callbacks", async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const scheduler = require("scheduler");
  let ran = false;
  scheduler.unstable_scheduleCallback(scheduler.unstable_NormalPriority, () => {
    ran = true;
  });
  await new Promise((resolve) => nodeSetTimeout(resolve, 100));
  process.stderr.write(`PROBE schedulerRan=${ran}\n`);
});
