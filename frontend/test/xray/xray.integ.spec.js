import {
  useSharedAdminLogin,
  createTestStore,
  createSavedQuestion,
} from "__support__/integrated_tests";
import { click } from "__support__/enzyme_utils";

import { mount } from "enzyme";
import { CardApi, SegmentApi, SettingsApi } from "metabase/services";

import { delay } from "metabase/lib/promise";
import {
  // FETCH_CARD_XRAY,
  FETCH_FIELD_XRAY,
  FETCH_SEGMENT_XRAY,
  FETCH_SHARED_TYPE_COMPARISON_XRAY,
  FETCH_TABLE_XRAY,
  FETCH_TWO_TYPES_COMPARISON_XRAY,
} from "metabase/xray/xray";

import FieldXray from "metabase/xray/containers/FieldXray";
import TableXRay from "metabase/xray/containers/TableXRay";
import SegmentXRay from "metabase/xray/containers/SegmentXRay";
// import CardXRay from "metabase/xray/containers/CardXRay";

import CostSelect from "metabase/xray/components/CostSelect";
import Constituent from "metabase/xray/components/Constituent";

import Question from "metabase-lib/lib/Question";
import * as Urls from "metabase/lib/urls";
import { INITIALIZE_QB, QUERY_COMPLETED } from "metabase/query_builder/actions";
import ActionsWidget from "metabase/query_builder/components/ActionsWidget";

// settings related actions for testing xray administration
import {
  INITIALIZE_SETTINGS,
  UPDATE_SETTING,
} from "metabase/admin/settings/settings";
import { LOAD_CURRENT_USER } from "metabase/redux/user";
import { END_LOADING } from "metabase/reference/reference";

import { getXrayEnabled, getMaxCost } from "metabase/xray/selectors";

import Icon from "metabase/components/Icon";
import Toggle from "metabase/components/Toggle";
import { Link } from "react-router";
import SettingsXrayForm from "metabase/admin/settings/components/SettingsXrayForm";
import { ComparisonDropdown } from "metabase/xray/components/ComparisonDropdown";
import Popover from "metabase/components/Popover";
import ItemLink from "metabase/xray/components/ItemLink";
import { TableLikeComparisonXRay } from "metabase/xray/containers/TableLikeComparison";
import {
  InsightCard,
  // NoisinessInsight,
  NormalRangeInsight,
  // AutocorrelationInsight,
} from "metabase/xray/components/InsightCard";

describe("xray integration tests", () => {
  let segmentId = null;
  let segmentId2 = null;
  let timeBreakoutQuestion = null;
  let segmentQuestion = null;
  let segmentQuestion2 = null;

  beforeAll(async () => {
    useSharedAdminLogin();

    const segmentDef = {
      name: "A Segment",
      description: "For testing xrays",
      table_id: 1,
      show_in_getting_started: true,
      definition: {
        source_table: 1,
        filter: ["time-interval", ["field-id", 1], -30, "day"],
      },
    };
    segmentId = (await SegmentApi.create(segmentDef)).id;

    const segmentDef2 = {
      name: "A Segment",
      description: "For testing segment comparison",
      table_id: 1,
      show_in_getting_started: true,
      definition: {
        source_table: 1,
        filter: ["time-interval", ["field-id", 1], -15, "day"],
      },
    };
    segmentId2 = (await SegmentApi.create(segmentDef2)).id;

    timeBreakoutQuestion = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata: null })
        .query()
        .addAggregation(["count"])
        .addBreakout(["datetime-field", ["field-id", 1], "day"])
        .question()
        .setDisplay("line")
        .setDisplayName("Time breakout question"),
    );

    segmentQuestion = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata: null })
        .query()
        .addFilter(["SEGMENT", segmentId])
        .question()
        .setDisplayName("Segment question"),
    );

    segmentQuestion2 = await createSavedQuestion(
      Question.create({ databaseId: 1, tableId: 1, metadata: null })
        .query()
        .addFilter(["SEGMENT", segmentId2])
        .question()
        .setDisplayName("Segment question"),
    );
  });

  afterAll(async () => {
    await SegmentApi.delete({
      segmentId,
      revision_message: "Sadly this segment didn't enjoy a long life either",
    });
    await SegmentApi.delete({
      segmentId: segmentId2,
      revision_message: "Sadly this segment didn't enjoy a long life either",
    });
    await CardApi.delete({ cardId: timeBreakoutQuestion.id() });
    await CardApi.delete({ cardId: segmentQuestion.id() });
    await CardApi.delete({ cardId: segmentQuestion2.id() });
    await SettingsApi.put({ key: "enable-xrays" }, true);
  });

  describe("table x-rays", async () => {
    it("should render the table x-ray page without errors", async () => {
      const store = await createTestStore();
      store.pushPath(`/xray/table/1/approximate`);

      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_TABLE_XRAY], { timeout: 20000 });

      const tableXRay = app.find(TableXRay);
      expect(tableXRay.length).toBe(1);
      expect(tableXRay.find(CostSelect).length).toBe(1);
      expect(tableXRay.find(Constituent).length).toBeGreaterThan(0);
      expect(tableXRay.text()).toMatch(/Orders/);
    });

    it("should render the table-by-table comparison page without errors", async () => {
      const store = await createTestStore();
      // Compare the table naively with itself because we don't
      // have anything real to compare with yet
      store.pushPath(`/xray/compare/tables/1/1/approximate`);

      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_SHARED_TYPE_COMPARISON_XRAY], {
        timeout: 20000,
      });

      const tableComparisonXray = app.find(TableLikeComparisonXRay);
      expect(tableComparisonXray.length).toBe(1);
      expect(tableComparisonXray.find(CostSelect).length).toBe(1);
    });
  });

  describe("field x-rays", async () => {
    it("should render the field x-ray page with expected insights", async () => {
      const store = await createTestStore();
      store.pushPath(`/xray/field/2/approximate`);

      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_FIELD_XRAY], { timeout: 20000 });

      const fieldXRay = app.find(FieldXray);
      expect(fieldXRay.length).toBe(1);
      expect(fieldXRay.find(CostSelect).length).toBe(1);

      expect(app.find(InsightCard).length > 0).toBe(true);
      expect(app.find(NormalRangeInsight).length).toBe(1);
    });
  });

  describe("question x-rays", async () => {
    it("should render the comparison of two raw data questions without errors", async () => {
      // NOTE: In the UI currently the only way to get here is to already be a comparison
      // and then witch the compared items
      const store = await createTestStore();
      store.pushPath(
        `/xray/compare/cards/${segmentQuestion.id()}/${segmentQuestion2.id()}/approximate`,
      );

      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_SHARED_TYPE_COMPARISON_XRAY], {
        timeout: 20000,
      });

      const segmentTableComparisonXray = app.find(TableLikeComparisonXRay);
      expect(segmentTableComparisonXray.length).toBe(1);
      expect(segmentTableComparisonXray.find(CostSelect).length).toBe(1);
    });
  });

  describe("segment x-rays", async () => {
    it("should render the segment x-ray page without errors", async () => {
      const store = await createTestStore();
      store.pushPath(`/xray/segment/${segmentId}/approximate`);

      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_SEGMENT_XRAY], { timeout: 20000 });

      const segmentXRay = app.find(SegmentXRay);
      expect(segmentXRay.length).toBe(1);
      expect(segmentXRay.find(CostSelect).length).toBe(1);

      // check that we have the links to expected comparisons
      click(segmentXRay.find(ComparisonDropdown).find(".Icon-compare"));
      const comparisonPopover = segmentXRay
        .find(ComparisonDropdown)
        .find(Popover);
      expect(
        comparisonPopover.find(
          `a[href="/xray/compare/segment/${segmentId}/table/1/approximate"]`,
        ).length,
      ).toBe(1);
      expect(
        comparisonPopover.find(
          `a[href="/xray/compare/segments/${segmentId}/${segmentId2}/approximate"]`,
        ).length,
      ).toBe(1);
    });

    it("should render the segment-by-segment comparison page without errors", async () => {
      const store = await createTestStore();
      store.pushPath(
        `/xray/compare/segments/${segmentId}/${segmentId2}/approximate`,
      );

      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_SHARED_TYPE_COMPARISON_XRAY], {
        timeout: 20000,
      });

      const segmentComparisonXray = app.find(TableLikeComparisonXRay);
      expect(segmentComparisonXray.length).toBe(1);
      expect(segmentComparisonXray.find(CostSelect).length).toBe(1);
    });

    it("should render the segment-by-table comparison page without errors", async () => {
      const store = await createTestStore();
      store.pushPath(`/xray/compare/segment/${segmentId}/table/1/approximate`);

      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_TWO_TYPES_COMPARISON_XRAY], {
        timeout: 20000,
      });

      const segmentTableComparisonXray = app.find(TableLikeComparisonXRay);
      expect(segmentTableComparisonXray.length).toBe(1);
      expect(segmentTableComparisonXray.find(CostSelect).length).toBe(1);

      // check that we have the links to expected comparisons
      const comparisonDropdowns = segmentTableComparisonXray.find(
        ComparisonDropdown,
      );
      expect(comparisonDropdowns.length).toBe(2);
      const leftSideDropdown = comparisonDropdowns.at(0);
      const rightSideDropdown = comparisonDropdowns.at(1);

      click(leftSideDropdown.find(ItemLink));
      const leftSidePopover = leftSideDropdown.find(Popover);
      expect(
        leftSidePopover.find(
          `a[href="/xray/compare/segment/${segmentId}/table/1/approximate"]`,
        ).length,
      ).toBe(0);
      // should filter out the current table
      expect(
        leftSidePopover.find(`a[href="/xray/compare/tables/1/1/approximate"]`)
          .length,
      ).toBe(0);

      // right side should be be table and show only segments options as comparision options atm
      click(rightSideDropdown.find(ItemLink));
      const rightSidePopover = rightSideDropdown.find(Popover);
      expect(
        rightSidePopover.find(
          `a[href="/xray/compare/segments/${segmentId}/${segmentId2}/approximate"]`,
        ).length,
      ).toBe(1);
      // should filter out the current segment
      expect(
        rightSidePopover.find(
          `a[href="/xray/compare/segments/${segmentId}/${segmentId}/approximate"]`,
        ).length,
      ).toBe(0);
    });

    it("should render the segment - by - raw query question comparison page without errors", async () => {
      const store = await createTestStore();
      store.pushPath(
        `/xray/compare/segment/${segmentId}/card/${segmentQuestion.id()}/approximate`,
      );

      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_TWO_TYPES_COMPARISON_XRAY], {
        timeout: 20000,
      });

      const segmentTableComparisonXray = app.find(TableLikeComparisonXRay);
      expect(segmentTableComparisonXray.length).toBe(1);
      expect(segmentTableComparisonXray.find(CostSelect).length).toBe(1);
    });
  });

  describe("navigation", async () => {
    it("should be possible to navigate between tables and their child fields", async () => {
      const store = await createTestStore();
      store.pushPath(`/xray/table/1/approximate`);

      const app = mount(store.getAppContainer());
      await store.waitForActions([FETCH_TABLE_XRAY], { timeout: 20000 });

      const tableXray = app.find(TableXRay);
      expect(tableXray.length).toBe(1);

      const fieldLink = app
        .find(Constituent)
        .first()
        .find(Link);

      click(fieldLink);

      await store.waitForActions([FETCH_FIELD_XRAY], { timeout: 20000 });
      const fieldXray = app.find(FieldXray);
      expect(fieldXray.length).toBe(1);
    });
  });

  // NOTE Atte Keinänen 8/24/17: I wanted to test both QB action widget xray action and the card/segment xray pages
  // in the same tests so that we see that end-to-end user experience matches our expectations

  describe("query builder actions", async () => {
    beforeEach(async () => {
      await SettingsApi.put({ key: "enable-xrays", value: "true" });
    });

    // it("let you see card xray for a timeseries question", async () => {
    //   await SettingsApi.put({ key: "xray-max-cost", value: "extended" });
    //   const store = await createTestStore();
    //   // make sure xrays are on and at the proper cost
    //   store.pushPath(Urls.question(timeBreakoutQuestion.id()));
    //   const app = mount(store.getAppContainer());

    //   await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
    //   // NOTE Atte Keinänen: Not sure why we need this delay to get most of action widget actions to appear :/
    //   await delay(500);

    //   const actionsWidget = app.find(ActionsWidget);
    //   click(actionsWidget.childAt(0));
    //   const xrayOptionIcon = actionsWidget.find(".Icon.Icon-bolt");
    //   click(xrayOptionIcon);

    //   await store.waitForActions([FETCH_CARD_XRAY], { timeout: 20000 });
    //   expect(store.getPath()).toBe(
    //     `/xray/card/${timeBreakoutQuestion.id()}/extended`,
    //   );

    //   const cardXRay = app.find(CardXRay);
    //   expect(cardXRay.length).toBe(1);
    //   expect(cardXRay.text()).toMatch(/Time breakout question/);

    //   // Should contain the expected insights
    //   expect(app.find(InsightCard).length > 0).toBe(true);
    //   expect(app.find(NoisinessInsight).length).toBe(1);
    //   expect(app.find(AutocorrelationInsight).length).toBe(1);
    // });

    // it("let you see segment xray for a question containing a segment", async () => {
    //   const store = await createTestStore();
    //   store.pushPath(Urls.question(segmentQuestion.id()));
    //   const app = mount(store.getAppContainer());

    //   await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

    //   const actionsWidget = app.find(ActionsWidget);
    //   click(actionsWidget.childAt(0));
    //   const xrayOptionIcon = actionsWidget.find(".Icon.Icon-bolt");
    //   click(xrayOptionIcon);

    //   await store.waitForActions([FETCH_SEGMENT_XRAY], { timeout: 20000 });
    //   expect(store.getPath()).toBe(`/xray/segment/${segmentId}/approximate`);

    //   const segmentXRay = app.find(SegmentXRay);
    //   expect(segmentXRay.length).toBe(1);
    //   expect(segmentXRay.find(CostSelect).length).toBe(1);
    //   expect(segmentXRay.text()).toMatch(/A Segment/);
    // });
  });

  describe("admin management of xrays", async () => {
    it("should allow an admin to manage xrays", async () => {
      let app;

      const store = await createTestStore();

      store.pushPath("/admin/settings/x_rays");

      app = mount(store.getAppContainer());

      await store.waitForActions([LOAD_CURRENT_USER, INITIALIZE_SETTINGS], {
        timeout: 20000,
      });

      const xraySettings = app.find(SettingsXrayForm);
      const xrayToggle = xraySettings.find(Toggle);

      // there should be a toggle
      expect(xrayToggle.length).toEqual(1);

      // things should be on
      expect(getXrayEnabled(store.getState())).toEqual(true);
      // the toggle should be on by default
      expect(xrayToggle.props().value).toEqual(true);

      // toggle the... toggle
      click(xrayToggle);
      await store.waitForActions([UPDATE_SETTING]);
      await delay(100); // give the store UI some time to update (otherwise we see React errors in logs)

      expect(getXrayEnabled(store.getState())).toEqual(false);

      // navigate to a previosuly x-ray-able entity
      store.pushPath(Urls.question(timeBreakoutQuestion.id()));
      await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

      // for some reason a delay is needed to get the full action suite
      await delay(500);

      const actionsWidget = app.find(ActionsWidget);
      click(actionsWidget.childAt(0));

      // there should not be an xray option
      const xrayOptionIcon = actionsWidget.find(".Icon.Icon-bolt");
      expect(xrayOptionIcon.length).toEqual(0);
    });

    it("should not show xray options for segments when xrays are disabled", async () => {
      // turn off xrays
      await SettingsApi.put({ key: "enable-xrays", value: false });

      const store = await createTestStore();

      store.pushPath(Urls.question(segmentQuestion.id()));
      const app = mount(store.getAppContainer());

      await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
      await delay(500);

      const actionsWidget = app.find(ActionsWidget);
      click(actionsWidget.childAt(0));
      const xrayOptionIcon = actionsWidget.find(".Icon.Icon-bolt");
      expect(xrayOptionIcon.length).toEqual(0);
    });

    it("should properly reflect the an admin set the max cost of xrays", async () => {
      await SettingsApi.put({ key: "enable-xrays", value: true });
      const store = await createTestStore();

      store.pushPath("/admin/settings/x_rays");

      const app = mount(store.getAppContainer());

      await store.waitForActions([LOAD_CURRENT_USER, INITIALIZE_SETTINGS]);

      const xraySettings = app.find(SettingsXrayForm);

      expect(xraySettings.find(Icon).length).toEqual(3);

      const approximate = xraySettings.find(".text-measure li").first();

      click(approximate);
      await store.waitForActions([UPDATE_SETTING]);
      await delay(100); // give the store UI some time to update (otherwise we see React errors in logs)

      expect(approximate.hasClass("text-brand")).toEqual(true);
      expect(getMaxCost(store.getState())).toEqual("approximate");

      store.pushPath(`/xray/table/1/approximate`);

      await store.waitForActions(FETCH_TABLE_XRAY, { timeout: 20000 });
      await delay(200);

      const tableXRay = app.find(TableXRay);
      expect(tableXRay.length).toBe(1);
      expect(tableXRay.find(CostSelect).length).toBe(1);
      // there should be two disabled states
      expect(tableXRay.find("a.disabled").length).toEqual(2);
    });
  });
  describe("data reference entry", async () => {
    it("should be possible to access an Xray from the data reference", async () => {
      // ensure xrays are on
      await SettingsApi.put({ key: "enable-xrays", value: true });
      const store = await createTestStore();

      store.pushPath("/reference/databases/1/tables/1");

      const app = mount(store.getAppContainer());

      await store.waitForActions([END_LOADING]);

      const xrayTableSideBarItem = app.find(".Icon.Icon-bolt");
      expect(xrayTableSideBarItem.length).toEqual(1);

      store.pushPath("/reference/databases/1/tables/1/fields/1");

      await store.waitForActions([END_LOADING]);
      const xrayFieldSideBarItem = app.find(".Icon.Icon-bolt");
      expect(xrayFieldSideBarItem.length).toEqual(1);
    });

    // it("should not be possible to access an Xray from the data reference if xrays are disabled", async () => {
    //   // turn off xrays
    //   await SettingsApi.put({ key: "enable-xrays", value: false });
    //   const store = await createTestStore();

    //   const app = mount(store.getAppContainer());

    //   store.pushPath("/reference/databases/1/tables/1");

    //   await store.waitForActions([END_LOADING]);

    //   const xrayTableSideBarItem = app.find(".Icon.Icon-bolt");
    //   expect(xrayTableSideBarItem.length).toEqual(0);

    //   store.pushPath("/reference/databases/1/tables/1/fields/1");
    //   await store.waitForActions([END_LOADING]);
    //   const xrayFieldSideBarItem = app.find(".Icon.Icon-bolt");
    //   expect(xrayFieldSideBarItem.length).toEqual(0);
    // });
  });

  afterAll(async () => {
    await delay(2000);
  });
});
