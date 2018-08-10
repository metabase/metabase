import puppeteer from "puppeteer";
import creds from "./creds";

const CAPTURES = [
  {
    url: "/",
    imagePath: "test-img/test1",
  },
  {
    url: "/collection/root",
    imagePath: "test-img/test2",
  },
  {
    url: "/question/1",
    imagePath: "test-img/question",
    setup: page => [
      page.waitForSelector(".LineAreaBarChart"),
      page.click(".AddButton"),
    ],
  },
];

const PAGE_CONFIG = {
  width: 1280,
  height: 960,
  deviceScaleFactor: 2,
};

const BASE_URL = "http://localhost:3000";

(async () => {
  const browser = await puppeteer.launch();

  async function capturePage({ url, imagePath, setup }) {
    const page = await browser.newPage();

    page.setViewport(PAGE_CONFIG);

    console.log(`Navigating to ${url}`);

    try {
      await page.goto(`${BASE_URL}${url}`, {
        waitUntil: ["load"],
        timeout: 12000,
      });
    } catch (error) {
      console.log("error", error);
    }

    console.log(`${url} loaded`);

    console.log(await page.url());

    if (setup) {
      console.log("Setup steps defined, performing those steps...");
      await Promise.all(setup(page));
      console.log("Setup steps complete");
    }

    console.log(`Taking screenshot`);
    await page.screenshot({ path: `${imagePath}.png` });
    console.log(`Screenshot taken`);

    return page;
  }

  async function login() {
    const EMAIL_SELECTOR = `input[type="email"]`;
    const PASSWORD_SELECTOR = `input[type="password"]`;
    const LOGIN_BUTTON_SELECTOR = ".Button--primary";

    const page = await browser.newPage();
    console.log("Starting login");

    await page.goto(BASE_URL);
    await page.click(EMAIL_SELECTOR);
    await page.keyboard.type(creds.username);

    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(creds.password);

    await Promise.all([
      page.click(LOGIN_BUTTON_SELECTOR),
      page.waitForNavigation(),
    ]);

    console.log("Login complete");
  }

  await login();

  for (let capture of CAPTURES) {
    await capturePage(capture);
  }

  console.log("Tasks complete, closing browser");
  browser.close();
})();
