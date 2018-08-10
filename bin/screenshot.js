import puppeteer from "puppeteer";
import creds from "./creds";

let browser, page;

async function setup() {
  browser = await puppeteer.launch();
  page = await browser.newPage();
  page.setViewport({ width: 1280, height: 920, deviceScaleFactor: 2 });
}

async function login() {
  const EMAIL_SELECTOR = `input[type="email"]`;
  const PASSWORD_SELECTOR = `input[type="password"]`;
  const LOGIN_BUTTON_SELECTOR = ".Button--primary";

  await page.goto("http://localhost:3000");
  await page.click(EMAIL_SELECTOR);
  await page.keyboard.type(creds.username);

  await page.click(PASSWORD_SELECTOR);
  await page.keyboard.type(creds.password);

  await page.click(LOGIN_BUTTON_SELECTOR);

  await page.waitForNavigation();
}

async function getReadMeImage() {
  await setup();
  await login();

  await page.goto("http://localhost:3000/question/1");
  await page.waitForSelector(".LineAreaBarChart");

  await page.click(".AddButton");

  await page.screenshot({ path: "docs/metabase-product-screenshot.png" });

  await browser.close();
}

getReadMeImage();
