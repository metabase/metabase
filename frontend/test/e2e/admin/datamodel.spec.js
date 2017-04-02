import {
    waitForElementText,
    findElement,
    waitForElementAndClick,
    waitForElementAndSendKeys,
    screenshot,
    ensureLoggedIn,
    describeE2E
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 600000;

describeE2E("admin/datamodel", () => {
    beforeEach(() =>
        ensureLoggedIn(server, driver, "bob@metabase.com", "12341234")
    );

    describe("data model editor", () => {
        it("should allow admin to edit data model", async () => {
            await driver.get(`${server.host}/admin/datamodel/database`);

            // hide orders table
            await waitForElementAndClick(driver, ".AdminList-items li:nth-child(2)");
            await screenshot(driver, "screenshots/admin-datamodel-orders.png");

            await waitForElementAndClick(driver, "#VisibilityTypes span:nth-child(2)");
            await waitForElementAndClick(driver, "#VisibilitySubTypes span:nth-child(3)");

            // unhide
            await waitForElementAndClick(driver, "#VisibilityTypes span:first-child");

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
            await driver.get(`${server.host}/admin/datamodel/database/1/table/2`);

            // add a segment
            await waitForElementAndClick(driver, "#SegmentsList a.text-brand");

            await waitForElementAndClick(driver, ".GuiBuilder-filtered-by a");
            await waitForElementAndClick(driver, "#FilterPopover .List-item:nth-child(4)>a");
            const addFilterButton = findElement(driver, "#FilterPopover .Button.disabled");
            await waitForElementAndClick(driver, "#OperatorSelector .Button.Button-normal.Button--medium:nth-child(2)");
            await waitForElementAndSendKeys(driver, "#FilterPopover textarea.border-purple", 'gmail');
            expect(await addFilterButton.isEnabled()).toBe(true);
            await addFilterButton.click();

            await waitForElementAndSendKeys(driver, "input[name='name']", 'Gmail users');
            await waitForElementAndSendKeys(driver, "textarea[name='description']", 'All people using Gmail for email');

            await findElement(driver, "button.Button.Button--primary").click();

            expect(await waitForElementText(driver, "#SegmentsList tr:first-child td:first-child")).toEqual("Gmail users");

            // add a metric
            await waitForElementAndClick(driver, "#MetricsList a.text-brand");

            await waitForElementAndClick(driver, "#Query-section-aggregation");
            await waitForElementAndClick(driver, "#AggregationPopover .List-item:nth-child(1)>a");

            await waitForElementAndSendKeys(driver, "input[name='name']", 'User count');
            await waitForElementAndSendKeys(driver, "textarea[name='description']", 'Total number of users');

            await findElement(driver, "button.Button.Button--primary").click();

            expect(await waitForElementText(driver, "#MetricsList tr:first-child td:first-child")).toEqual("User count");
        });
    });
});
