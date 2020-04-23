/* eslint-disable */
// NOTE Atte Keinänen 9/8/17: This can't be converted to Jest as NodeJS doesn't have cookie support
// Probably we just want to remove this test.

import { By } from "selenium-webdriver";
import {
  waitForUrl,
  screenshot,
  loginMetabase,
  describeE2E,
} from "../support/utils";

import { METABASE_SESSION_COOKIE } from "metabase/lib/cookies";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describeE2E("auth/login", () => {
  let sessionId;

  describe("has no cookie", () => {
    beforeEach(async () => {
      await driver.get(`${server.host}/`);
      await driver.manage().deleteAllCookies();
    });

    it("should take you to the login page", async () => {
      await driver.get(`${server.host}/`);
      await waitForUrl(driver, `${server.host}/auth/login?redirect=%2F`);
      expect(await driver.isElementPresent(By.css("[name=email]"))).toEqual(
        true,
      );
      await screenshot(driver, "screenshots/auth-login.png");
    });

    it("should log you in", async () => {
      await driver.get(`${server.host}/`);
      await loginMetabase(driver, "bob@metabase.com", "12341234");
      await waitForUrl(driver, `${server.host}/`);
      const sessionCookie = await driver
        .manage()
        .getCookie(METABASE_SESSION_COOKIE);
      sessionId = sessionCookie.value;
    });

    it("should redirect you after logging in", async () => {
      await driver.get(`${server.host}/questions`);
      await waitForUrl(
        driver,
        `${server.host}/auth/login?redirect=%2Fquestions`,
      );
      await loginMetabase(driver, "bob@metabase.com", "12341234");
      await waitForUrl(driver, `${server.host}/questions`);
    });
  });

  describe("valid session cookie", () => {
    beforeEach(async () => {
      await driver.get(`${server.host}/`);
      await driver.manage().deleteAllCookies();
      await driver.manage().addCookie(METABASE_SESSION_COOKIE, sessionId);
    });

    it("is logged in", async () => {
      await driver.get(`${server.host}/`);
      await waitForUrl(driver, `${server.host}/`);
      await screenshot(driver, "screenshots/loggedin.png");
    });

    it("loads the qb", async () => {
      await driver.get(
        `${server.host}/question#eyJuYW1lIjpudWxsLCJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJ0eXBlIjoibmF0aXZlIiwibmF0aXZlIjp7InF1ZXJ5Ijoic2VsZWN0ICdvaCBoYWkgZ3Vpc2Ug8J-QsScifSwicGFyYW1ldGVycyI6W119LCJkaXNwbGF5Ijoic2NhbGFyIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e319`,
      );
      await waitForUrl(
        driver,
        `${server.host}/question#eyJuYW1lIjpudWxsLCJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJ0eXBlIjoibmF0aXZlIiwibmF0aXZlIjp7InF1ZXJ5Ijoic2VsZWN0ICdvaCBoYWkgZ3Vpc2Ug8J-QsScifSwicGFyYW1ldGVycyI6W119LCJkaXNwbGF5Ijoic2NhbGFyIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e319`,
      );
      await screenshot(driver, "screenshots/qb.png");
    });
  });
});
