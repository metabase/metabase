import { type BrowserContext, test as base } from "@playwright/test";

import { clearWebStorage } from "./page-scripts";

// Each story gets its own page in a context shared by the worker,
// with cookies and web storage cleared first.
export const test = base.extend<object, { workerContext: BrowserContext }>({
  workerContext: [
    async ({ browser }, provide, workerInfo) => {
      const { baseURL, viewport, deviceScaleFactor, locale, timezoneId } =
        workerInfo.project.use;
      const context = await browser.newContext({
        baseURL,
        viewport,
        deviceScaleFactor,
        locale,
        timezoneId,
      });
      await provide(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  context: async ({ workerContext }, provide) => {
    await provide(workerContext);
  },
  page: async ({ workerContext }, provide) => {
    await workerContext.clearCookies();
    const page = await workerContext.newPage();
    await page.addInitScript(clearWebStorage);
    await provide(page);
    await page.close();
  },
});
