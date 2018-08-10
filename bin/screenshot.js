#!/usr/bin/env node

import puppeteer from "puppeteer";
import creds from "./creds";

import tempdir from "tempdir";
import fs from "fs";
import pngFileStream from "png-file-stream";
import GIFEncoder from "gifencoder";

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
    gif: true,
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

  // Basically a rip of webgif. Thanks to https://github.com/anishkny/webgif for
  // the inspiration to add gif support
  async function captureGif({ url, imagePath, setup, gif, duration = 10 }) {
    const page = await browser.newPage();

    // create a directory to store our sequential pngs until we create the gif
    const workingDir = await tempdir();

    page.setViewport({
      width: 1024,
      height: 768,
    });

    if (!setup) {
      console.log(
        "In order to capture a gif something needs to be happening. Define `setup` steps",
      );
      return false;
    }

    console.log(`GIF Capture for ${url}`);

    // create an array to store our screenshot promises
    const screenshotPromises = [];

    try {
      await page.goto(`${BASE_URL}${url}`, {
        waitUntil: ["load"],
        timeout: 12000,
      });
    } catch (error) {
      console.log("error", error);
    }

    // loop once for each "frame" of the gif
    for (let i = 0; i < duration; i++) {
      let filename = `${workingDir}/T${new Date().getTime()}.png`;
      process.stdout.write(".");
      await setup(page)[i];
      screenshotPromises.push(page.screenshot({ path: filename }));
      await delay(1000);
    }

    await delay(1000);
    await Promise.all(screenshotPromises);
    console.log(`\nEncoding GIF: ${imagePath}`);
    const encoder = new GIFEncoder(1024, 768);
    await pngFileStream(`${workingDir}/T*png`)
      .pipe(encoder.createWriteStream({ repeat: 0, delay: 200, quality: 20 }))
      .pipe(fs.createWriteStream(`${imagePath}.gif`));
    await page.close();
  }

  async function capturePage({ url, imagePath, setup, gif }) {
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
    capture.gif ? await captureGif(capture) : await capturePage(capture);
  }

  console.log("Tasks complete, closing browser");
  browser.close();
})();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
