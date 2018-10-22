import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";
import { click, clickButton, setInputValue } from "__support__/enzyme_utils";
import { delay } from "metabase/lib/promise";

import React from "react";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import {
  INITIALIZE_QB,
  QUERY_COMPLETED,
  SET_DATASET_QUERY,
  setQueryDatabase,
  setQuerySourceTable,
} from "metabase/query_builder/actions";

import {
  FETCH_TABLE_METADATA,
  FETCH_FIELD_VALUES,
} from "metabase/redux/metadata";

import FieldList, {
  DimensionPicker,
} from "metabase/query_builder/components/FieldList";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

import FilterWidget from "metabase/query_builder/components/filters/FilterWidget";
import FieldName from "metabase/query_builder/components/FieldName";
import RunButton from "metabase/query_builder/components/RunButton";
import { Option } from "metabase/components/Select";

import OperatorSelector from "metabase/query_builder/components/filters/OperatorSelector";
import BreakoutWidget from "metabase/query_builder/components/BreakoutWidget";
import { getQueryResults } from "metabase/query_builder/selectors";

import * as Urls from "metabase/lib/urls";

const initQbWithDbAndTable = (dbId, tableId) => {
  return async () => {
    const store = await createTestStore();
    store.pushPath(Urls.plainQuestion());
    const qb = mount(store.connectContainer(<QueryBuilder />));
    await store.waitForActions([INITIALIZE_QB]);

    // Use Products table
    store.dispatch(setQueryDatabase(dbId));
    store.dispatch(setQuerySourceTable(tableId));
    await store.waitForActions([FETCH_TABLE_METADATA]);

    return { store, qb };
  };
};

const initQbWithOrdersTable = initQbWithDbAndTable(1, 1);
const initQBWithReviewsTable = initQbWithDbAndTable(1, 4);

describe("QueryBuilder editor bar", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("for filtering by Rating category field in Reviews table", () => {
    let store = null;
    let qb = null;
    beforeAll(async () => {
      ({ store, qb } = await initQBWithReviewsTable());
    });

    // NOTE: Sequential tests; these may fail in a cascading way but shouldn't affect other tests

    it("lets you add Rating field as a filter", async () => {
      // TODO Atte Keinänen 7/13/17: Extracting GuiQueryEditor's contents to smaller React components
      // would make testing with selectors more natural
      const filterSection = qb.find(".GuiBuilder-filtered-by");
      const addFilterButton = filterSection.find(".AddButton");
      click(addFilterButton);

      const filterPopover = filterSection.find(FilterPopover);

      const ratingFieldButton = filterPopover
        .find(FieldList)
        .find('h4[children="Rating"]');
      expect(ratingFieldButton.length).toBe(1);
      click(ratingFieldButton);
    });

    it("lets you see its field values in filter popover", async () => {
      await store.waitForActions([FETCH_FIELD_VALUES]);

      // FIXME: TokenField asynchronously updates displayed options :(
      await delay(10);

      // Same as before applies to FilterPopover too: individual list items could be in their own components
      const filterPopover = qb.find(FilterPopover);
      const fieldItems = filterPopover.find("li");
      expect(fieldItems.length).toBe(5 + 1); // NOTE: bleh, one for the input

      // should be in alphabetical order
      expect(fieldItems.at(1).text()).toBe("1");
      expect(fieldItems.last().text()).toBe("5");
    });

    it("lets you set 'Rating is 5' filter", async () => {
      const filterPopover = qb.find(FilterPopover);

      setInputValue(filterPopover.find("input"), "5");

      const addFilterButton = filterPopover.find(
        'button[children="Add filter"]',
      );
      clickButton(addFilterButton);

      await store.waitForActions([SET_DATASET_QUERY]);

      expect(qb.find(FilterPopover).length).toBe(0);
      const filterWidget = qb.find(FilterWidget);
      expect(filterWidget.length).toBe(1);
      expect(filterWidget.text()).toBe("Rating is equal to5");
    });

    it("lets you remove the added filter", async () => {
      const filterWidget = qb.find(FilterWidget);
      click(filterWidget.find(".Icon-close"));
      await store.waitForActions([SET_DATASET_QUERY]);

      expect(qb.find(FilterWidget).length).toBe(0);
    });
  });

  describe("for filtering by ID number field in Reviews table", () => {
    let store = null;
    let qb = null;
    beforeAll(async () => {
      ({ store, qb } = await initQBWithReviewsTable());
    });

    it("lets you add ID field as a filter", async () => {
      const filterSection = qb.find(".GuiBuilder-filtered-by");
      const addFilterButton = filterSection.find(".AddButton");
      click(addFilterButton);

      const filterPopover = filterSection.find(FilterPopover);

      const ratingFieldButton = filterPopover
        .find(FieldList)
        .find('h4[children="ID"]');
      expect(ratingFieldButton.length).toBe(1);
      click(ratingFieldButton);
    });

    it("lets you see a correct number of operators in filter popover", () => {
      const filterPopover = qb.find(FilterPopover);

      // const optionsIcon = filterPopover.find(`a[children="Options"]`);
      const operatorSelector = filterPopover.find(OperatorSelector);

      click(operatorSelector);

      expect(operatorSelector.find(Option).length).toBe(9);
    });

    it("lets you set 'ID is 10' filter", async () => {
      const filterPopover = qb.find(FilterPopover);
      const filterInput = filterPopover.find("input");
      setInputValue(filterInput, "10");

      const addFilterButton = filterPopover.find(
        'button[children="Add filter"]',
      );
      clickButton(addFilterButton);

      await store.waitForActions([SET_DATASET_QUERY]);

      expect(qb.find(FilterPopover).length).toBe(0);
      const filterWidget = qb.find(FilterWidget);
      expect(filterWidget.length).toBe(1);
      expect(filterWidget.text()).toBe("ID is equal to10");
    });

    it("lets you update the filter to 'ID is between 1 or 100'", async () => {
      const filterWidget = qb.find(FilterWidget);
      click(filterWidget.find(FieldName));

      const filterPopover = qb.find(FilterPopover);
      const operatorSelector = filterPopover.find(OperatorSelector);
      click(operatorSelector);
      clickButton(operatorSelector.find('[children="Between"]'));

      const betweenInputs = filterPopover.find("input");
      expect(betweenInputs.length).toBe(2);

      setInputValue(betweenInputs.at(1), "asdasd");
      const updateFilterButton = filterPopover.find(
        'button[children="Update filter"]',
      );
      expect(updateFilterButton.props().className).toMatch(/disabled/);

      setInputValue(betweenInputs.at(0), "1");
      setInputValue(betweenInputs.at(1), "100");

      clickButton(updateFilterButton);

      await store.waitForActions([SET_DATASET_QUERY]);
      expect(qb.find(FilterPopover).length).toBe(0);
      expect(filterWidget.text()).toBe("ID between1100");
    });
  });

  describe("for grouping by Total in Orders table", async () => {
    let store = null;
    let qb = null;
    beforeAll(async () => {
      ({ store, qb } = await initQbWithOrdersTable());
    });

    it("lets you group by Total with the default binning option", async () => {
      const breakoutSection = qb.find(".GuiBuilder-groupedBy");
      const addBreakoutButton = breakoutSection.find(".AddButton");
      click(addBreakoutButton);

      const breakoutPopover = breakoutSection.find("#BreakoutPopover");
      const subtotalFieldButton = breakoutPopover
        .find(FieldList)
        .find('h4[children="Total"]');
      expect(subtotalFieldButton.length).toBe(1);
      click(subtotalFieldButton);

      await store.waitForActions([SET_DATASET_QUERY]);

      const breakoutWidget = qb.find(BreakoutWidget).first();
      expect(breakoutWidget.text()).toBe("Total: Auto binned");
    });
    it("produces correct results for default binning option", async () => {
      // Run the raw data query
      click(qb.find(RunButton));
      await store.waitForActions([QUERY_COMPLETED]);

      // We can use the visible row count as we have a low number of result rows
      expect(qb.find(".ShownRowCount").text()).toBe("Showing 11 rows");

      // Get the binning
      const results = getQueryResults(store.getState())[0];
      const breakoutBinningInfo = results.data.cols[0].binning_info;
      expect(breakoutBinningInfo.binning_strategy).toBe("num-bins");
      expect(breakoutBinningInfo.bin_width).toBe(30);
      expect(breakoutBinningInfo.num_bins).toBe(8);
    });
    it("lets you change the binning strategy to 100 bins", async () => {
      const breakoutWidget = qb.find(BreakoutWidget).first();
      click(
        breakoutWidget
          .find(FieldName)
          .children()
          .first(),
      );
      const breakoutPopover = qb.find("#BreakoutPopover");

      const subtotalFieldButton = breakoutPopover
        .find(FieldList)
        .find('.List-item--selected h4[children="Auto binned"]');
      expect(subtotalFieldButton.length).toBe(1);
      click(subtotalFieldButton);

      click(qb.find(DimensionPicker).find('a[children="100 bins"]'));

      await store.waitForActions([SET_DATASET_QUERY]);
      expect(breakoutWidget.text()).toBe("Total: 100 bins");
    });
    it("produces correct results for 100 bins", async () => {
      click(qb.find(RunButton));
      await store.waitForActions([QUERY_COMPLETED]);

      expect(qb.find(".ShownRowCount").text()).toBe("Showing 116 rows");
      const results = getQueryResults(store.getState())[0];
      const breakoutBinningInfo = results.data.cols[0].binning_info;
      expect(breakoutBinningInfo.binning_strategy).toBe("num-bins");
      expect(breakoutBinningInfo.bin_width).toBe(2.5);
      expect(breakoutBinningInfo.num_bins).toBe(100);
    });
    it("lets you disable the binning", async () => {
      const breakoutWidget = qb.find(BreakoutWidget).first();
      click(
        breakoutWidget
          .find(FieldName)
          .children()
          .first(),
      );
      const breakoutPopover = qb.find("#BreakoutPopover");

      const subtotalFieldButton = breakoutPopover
        .find(FieldList)
        .find('.List-item--selected h4[children="100 bins"]');
      expect(subtotalFieldButton.length).toBe(1);
      click(subtotalFieldButton);

      click(qb.find(DimensionPicker).find('a[children="Don\'t bin"]'));
    });
    it("produces the expected count of rows when no binning", async () => {
      click(qb.find(RunButton));
      await store.waitForActions([QUERY_COMPLETED]);

      // We just want to see that there are a lot more rows than there would be if a binning was active
      expect(qb.find(".ShownRowCount").text()).toBe("Showing first 2,000 rows");

      const results = getQueryResults(store.getState())[0];
      expect(results.data.cols[0].binning_info).toBe(undefined);
    });
  });

  describe("for grouping by Latitude location field through Users FK in Orders table", async () => {
    let store = null;
    let qb = null;
    beforeAll(async () => {
      ({ store, qb } = await initQbWithOrdersTable());
    });

    it("lets you group by Latitude with the default binning option", async () => {
      const breakoutSection = qb.find(".GuiBuilder-groupedBy");
      const addBreakoutButton = breakoutSection.find(".AddButton");
      click(addBreakoutButton);

      const breakoutPopover = breakoutSection.find("#BreakoutPopover");

      const userSectionButton = breakoutPopover
        .find(FieldList)
        .find('h3[children="User"]');
      expect(userSectionButton.length).toBe(1);
      click(userSectionButton);

      const subtotalFieldButton = breakoutPopover
        .find(FieldList)
        .find('h4[children="Latitude"]');
      expect(subtotalFieldButton.length).toBe(1);
      click(subtotalFieldButton);

      await store.waitForActions([SET_DATASET_QUERY]);

      const breakoutWidget = qb.find(BreakoutWidget).first();
      expect(breakoutWidget.text()).toBe("UserLatitude: Auto binned");
    });

    it("produces correct results for default binning option", async () => {
      // Run the raw data query
      click(qb.find(RunButton));
      await store.waitForActions([QUERY_COMPLETED]);

      expect(qb.find(".ShownRowCount").text()).toBe("Showing 6 rows");

      const results = getQueryResults(store.getState())[0];
      const breakoutBinningInfo = results.data.cols[0].binning_info;
      expect(breakoutBinningInfo.binning_strategy).toBe("bin-width");
      expect(breakoutBinningInfo.bin_width).toBe(10);
      expect(breakoutBinningInfo.num_bins).toBe(6);
    });

    it("lets you group by Latitude with the 'Bin every 1 degree'", async () => {
      const breakoutWidget = qb.find(BreakoutWidget).first();
      click(
        breakoutWidget
          .find(FieldName)
          .children()
          .first(),
      );
      const breakoutPopover = qb.find("#BreakoutPopover");

      const subtotalFieldButton = breakoutPopover
        .find(FieldList)
        .find('.List-item--selected h4[children="Auto binned"]');
      expect(subtotalFieldButton.length).toBe(1);
      click(subtotalFieldButton);

      click(qb.find(DimensionPicker).find('a[children="Bin every 1 degree"]'));

      await store.waitForActions([SET_DATASET_QUERY]);
      expect(breakoutWidget.text()).toBe("UserLatitude: 1°");
    });
    it("produces correct results for 'Bin every 1 degree'", async () => {
      // Run the raw data query
      click(qb.find(RunButton));
      await store.waitForActions([QUERY_COMPLETED]);

      expect(qb.find(".ShownRowCount").text()).toBe("Showing 40 rows");

      const results = getQueryResults(store.getState())[0];
      const breakoutBinningInfo = results.data.cols[0].binning_info;
      expect(breakoutBinningInfo.binning_strategy).toBe("bin-width");
      expect(breakoutBinningInfo.bin_width).toBe(1);
      expect(breakoutBinningInfo.num_bins).toBe(46);
    });
  });
});
