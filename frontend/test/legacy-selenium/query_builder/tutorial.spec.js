/* eslint-disable */
// NOTE Atte Keinänen 28/8/17: This should be converted to Jest/Enzyme. I will be tricky because tutorial involves
// lots of direct DOM manipulation. See also "Ability to dismiss popovers, modals etc" in
// https://github.com/metabase/metabase/issues/5527

import {
  waitForElement,
  waitForElementRemoved,
  waitForElementAndClick,
  waitForElementAndSendKeys,
  waitForUrl,
  screenshot,
  describeE2E,
  ensureLoggedIn,
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

describeE2E("tutorial", () => {
  beforeAll(async () => {
    await ensureLoggedIn(server, driver, "bob@metabase.com", "12341234");
  });

  // TODO Atte Keinänen 6/22/17: Failing test, disabled until converted to use Jest and Enzyme
  xit("should guide users through query builder tutorial", async () => {
    await driver.get(`${server.host}/?new`);
    await waitForUrl(driver, `${server.host}/?new`);

    await waitForElementAndClick(driver, ".Modal .Button.Button--primary");
    await waitForElementAndClick(driver, ".Modal .Button.Button--primary");
    await waitForElementAndClick(driver, ".Modal .Button.Button--primary");

    await waitForUrl(driver, `${server.host}/question`);
    await waitForElement(driver, ".Modal .Button.Button--primary");
    await screenshot(driver, "screenshots/setup-tutorial-qb.png");
    await waitForElementAndClick(driver, ".Modal .Button.Button--primary");

    await waitForElement(driver, "#QB-TutorialTableImg");
    // a .Modal-backdrop element blocks clicks for a while during transition?
    await waitForElementRemoved(driver, ".Modal-backdrop");
    await waitForElementAndClick(driver, ".GuiBuilder-data a");

    // select sample dataset db
    try {
      // in a try/catch in case the instance only has one db
      await waitForElementAndClick(
        driver,
        "#DatabaseSchemaPicker .List-section:last-child .List-section-header",
        1000,
      );
    } catch (e) {}

    // select orders table
    await waitForElementAndClick(
      driver,
      "#TablePicker .List-item:first-child>a",
    );

    // select filters
    await waitForElement(driver, "#QB-TutorialFunnelImg");
    await waitForElementAndClick(
      driver,
      ".GuiBuilder-filtered-by .Query-section:not(.disabled) a",
    );

    await waitForElementAndClick(
      driver,
      "#FilterPopover .List-item:first-child>a",
    );

    await waitForElementAndClick(
      driver,
      "input[data-ui-tag='relative-date-input']",
    );
    await waitForElementAndSendKeys(
      driver,
      "#FilterPopover input.border-purple",
      "10",
    );
    await waitForElementAndClick(
      driver,
      ".Button[data-ui-tag='add-filter']:not(.disabled)",
    );

    // select aggregations
    await waitForElement(driver, "#QB-TutorialCalculatorImg");
    await waitForElementAndClick(driver, "#Query-section-aggregation");
    await waitForElementAndClick(
      driver,
      "#AggregationPopover .List-item:nth-child(2)>a",
    );

    // select breakouts
    await waitForElement(driver, "#QB-TutorialBananaImg");
    await waitForElementAndClick(
      driver,
      ".Query-section.Query-section-breakout>div",
    );

    await waitForElementAndClick(
      driver,
      "#BreakoutPopover .List-item:first-child .Field-extra>a",
    );
    await waitForElementAndClick(
      driver,
      "#TimeGroupingPopover .List-item:nth-child(4)>a",
    );

    // run query
    await waitForElement(driver, "#QB-TutorialRocketImg");
    await waitForElementAndClick(driver, ".Button.RunButton");

    // wait for query to complete
    await waitForElement(driver, "#QB-TutorialChartImg", 20000);

    // switch visualization
    await waitForElementAndClick(driver, "#VisualizationTrigger");
    // this step occassionally fails without the timeout
    // await driver.sleep(500);
    await waitForElementAndClick(
      driver,
      "#VisualizationPopover li:nth-child(4)",
    );

    // end tutorial
    await waitForElement(driver, "#QB-TutorialBoatImg");
    await waitForElementAndClick(driver, ".Modal .Button.Button--primary");
    await waitForElementAndClick(
      driver,
      ".PopoverBody .Button.Button--primary",
    );

    await screenshot(driver, "screenshots/setup-tutorial-qb-end.png");
  });
});
