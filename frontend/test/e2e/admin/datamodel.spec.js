import path from "path";

import { isReady } from "../support/start-server";
import { setup, cleanup } from "../support/setup";
import { By, until } from "selenium-webdriver";

import {
    waitForElement,
    waitForElementText,
    waitForElementRemoved,
    findElement,
    waitForElementAndClick,
    waitForElementAndSendKeys,
    waitForUrl,
    screenshot,
    loginMetabase
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 600000;

describe("admin/datamodel", () => {
    let server, sauceConnect, driver;

    beforeAll(async () => {
        ({ server, sauceConnect, driver } = await setup());
    });

    it ("should start", async () => {
        expect(await isReady(server.host)).toEqual(true);
    });

    describe("data model editor", () => {
        it("should allow admin to edit data model", async () => {
            await driver.get(`${server.host}/`);
            await loginMetabase(driver, "bob@metabase.com", "12341234");
            await waitForUrl(driver, `${server.host}/`);

            await driver.get(`${server.host}/admin/datamodel/database`);

            // hide orders table
            await waitForElementAndClick(driver, ".AdminList-items li:nth-child(2)");
            await screenshot(driver, "screenshots/admin-datamodel-orders.png");

            await waitForElementAndClick(driver, "#VisibilityTypes span:nth-child(2)");
            await waitForElementAndClick(driver, "#VisibilitySubTypes span:nth-child(3)");

            // hide fields from people table
            await waitForElementAndClick(driver, ".AdminList-items li:nth-child(3)");

            await waitForElementAndClick(driver, "#ColumnsList li:first-child .TableEditor-field-visibility");
            await waitForElementAndClick(driver, ".ColumnarSelector-rows li:nth-child(2) .ColumnarSelector-row");

            await waitForElementAndClick(driver, "#ColumnsList li:nth-child(2) .TableEditor-field-visibility");
            await waitForElementAndClick(driver, ".ColumnarSelector-rows li:nth-child(3) .ColumnarSelector-row");

            // modify special type for address field
            await waitForElementAndClick(driver, "#ColumnsList li:first-child .TableEditor-field-special-type");
            await waitForElementAndClick(driver, ".ColumnarSelector-rows li:nth-child(2) .ColumnarSelector-row");

            //TODO: verify tables and fields are hidden in query builder
        });

        it("should allow admin to create segments and metrics", async () => {
            // not resetting state for now to save time since tests are run linearly
            // might want to reinitialize every test if we ever start running tests in parallel

            // add a segment
            await waitForElementAndClick(driver, "#SegmentsList a.text-brand");

            await waitForElementAndClick(driver, ".GuiBuilder-filtered-by a");
            await waitForElementAndClick(driver, "#FilterPopover .List-item:nth-child(4)>a");
            const addFilterButton = findElement(driver, "#FilterPopover .Button.disabled");
            await waitForElementAndClick(driver, "#OperatorSelector .Button.Button-normal.Button--medium:nth-child(3)");
            await waitForElementAndSendKeys(driver, "#FilterPopover input.border-purple", 'gmail');
            expect(await addFilterButton.isEnabled()).toBe(true);
            await addFilterButton.click();

            await waitForElementAndSendKeys(driver, "input[name='name']", 'Gmail users');
            await waitForElementAndSendKeys(driver, "textarea[name='description']", 'All people using Gmail for email');

            await findElement(driver, "button.Button.Button--primary").click();

            expect(await waitForElementText(driver, "#SegmentsList tr:first-child td:first-child")).toEqual("Gmail users");

            // add a metric
            await waitForElementAndClick(driver, "#MetricsList a.text-brand");

            await waitForElementAndClick(driver, "#Query-section-aggregation");
            await waitForElementAndClick(driver, "#AggregationPopover .List-item:nth-child(2)>a");

            await waitForElementAndSendKeys(driver, "input[name='name']", 'User count');
            await waitForElementAndSendKeys(driver, "textarea[name='description']", 'Total number of users');

            await findElement(driver, "button.Button.Button--primary").click();

            expect(await waitForElementText(driver, "#MetricsList tr:first-child td:first-child")).toEqual("User count");
        });
    });

    afterAll(async () => {
        await cleanup({ server, sauceConnect, driver });
    });
});
