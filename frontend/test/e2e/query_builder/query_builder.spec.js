import path from "path";

import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import {
    waitForElement,
    waitForElementRemoved,
    findElement,
    waitForAndClickElement,
    waitForUrl,
    screenshot,
    loginMetabase
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describe("query_builder", () => {
    let server, sauceConnect, driver;

    beforeAll(async () => {
        ({ server, sauceConnect, driver } = await setup());
    });

    it ("should start", async () => {
        expect(await isReady(server.host)).toEqual(true);
    });

    describe("tables", () => {
        it("should allow users to create pivot tables", async () => {
            await driver.get(`${server.host}/`);
            await loginMetabase(driver, "bob@metabase.com", "12341234");
            await waitForUrl(driver, `${server.host}/`);

            await driver.get(`${server.host}/q`);

            await screenshot(driver, "screenshots/qb-initial.png");

            await waitForAndClickElement(driver, "#TablePicker .List-item:first-child>a");

            await waitForAndClickElement(driver, "#Query-section-aggregation");
            await waitForAndClickElement(driver, "#AggregationPopover .List-item:nth-child(2)>a");

            await waitForAndClickElement(driver, ".Query-section.Query-section-breakout #BreakoutWidget");
            await waitForAndClickElement(driver, "#BreakoutPopover .List-section:nth-child(3) .List-section-header");
            await waitForAndClickElement(driver, "#BreakoutPopover .List-item:nth-child(12)>a");

            await waitForAndClickElement(driver, ".Query-section.Query-section-breakout #BreakoutWidget .AddButton");
            await waitForAndClickElement(driver, "#BreakoutPopover .List-item:first-child .Field-extra>a");
            await waitForAndClickElement(driver, "#TimeGroupingPopover .List-item:nth-child(4)>a");

            await waitForAndClickElement(driver, ".Button.RunButton");

            await waitForElementRemoved(driver, ".Loading", 20000);
            await screenshot(driver, "screenshots/qb-pivot-table.png");
        });
    });

    afterAll(async () => {
        await cleanup({ server, sauceConnect, driver });
    });
});
