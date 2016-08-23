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
            await waitForAndClickElement(driver, ".AdminList-items li:nth-child(2)");
            await screenshot(driver, "screenshots/admin-datamodel-orders.png");

            await waitForAndClickElement(driver, "#VisibilityTypes span:nth-child(2)");
            await waitForAndClickElement(driver, "#VisibilitySubTypes span:nth-child(3)");

            // hide fields from people table
            await waitForAndClickElement(driver, ".AdminList-items li:nth-child(3)");

            await waitForAndClickElement(driver, "#ColumnsList li:first-child .TableEditor-field-visibility");
            await waitForAndClickElement(driver, ".ColumnarSelector-rows li:nth-child(2) .ColumnarSelector-row");

            await waitForAndClickElement(driver, "#ColumnsList li:nth-child(2) .TableEditor-field-visibility");
            await waitForAndClickElement(driver, ".ColumnarSelector-rows li:nth-child(3) .ColumnarSelector-row");

            // modify special type for address field
            await waitForAndClickElement(driver, "#ColumnsList li:first-child .TableEditor-field-special-type");
            await waitForAndClickElement(driver, ".ColumnarSelector-rows li:nth-child(2) .ColumnarSelector-row");

            //TODO: verify tables and fields are hidden in query builder
        });

        it("should allow admin to create segments and metrics", async () => {
            // not resetting state for now to save time since tests are run linearly
            // might want to reinitialize every test if we ever start running tests in parallel

            // add a segment
            await waitForAndClickElement(driver, "#SegmentsList a.text-brand");

            await waitForAndClickElement(driver, ".GuiBuilder-filtered-by a");
            await waitForAndClickElement(driver, "#FilterPopover .List-item:nth-child(4)>a");
            const addFilterButton = findElement(driver, "#FilterPopover .Button.disabled");
            await waitForAndClickElement(driver, "#OperatorSelector .Button.Button-normal.Button--medium:nth-child(3)");
            await findElement(driver, "#FilterPopover input.border-purple").sendKeys('gmail');
            expect(await addFilterButton.isEnabled()).toBe(true);
            await addFilterButton.click();

            await findElement(driver, "input[name='name']").sendKeys('Gmail users');
            await findElement(driver, "textarea[name='description']").sendKeys('All people using Gmail for email');

            await findElement(driver, "button.Button.Button--primary").click();

            expect(await findElement(driver, "#SegmentsList tr:first-child td:first-child").getText()).toEqual("Gmail users");

            // add a metric
            await waitForAndClickElement(driver, "#MetricsList a.text-brand");

            await waitForAndClickElement(driver, "#Query-section-aggregation");
            await waitForAndClickElement(driver, "#AggregationPopover .List-item:nth-child(2)>a");

            await findElement(driver, "input[name='name']").sendKeys('User count');
            await findElement(driver, "textarea[name='description']").sendKeys('Total number of users');

            await findElement(driver, "button.Button.Button--primary").click();

            expect(await findElement(driver, "#MetricsList tr:first-child td:first-child").getText()).toEqual("User count");
        });
    });

    afterAll(async () => {
        await cleanup({ server, sauceConnect, driver });
    });
});
