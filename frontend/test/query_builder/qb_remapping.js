import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";
import { click, clickButton } from "__support__/enzyme_utils";

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
  deleteFieldDimension,
  updateFieldDimension,
  updateFieldValues,
  FETCH_TABLE_METADATA,
} from "metabase/redux/metadata";

import FieldList from "metabase/query_builder/components/FieldList";
import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";

import CheckBox from "metabase/components/CheckBox";
import FilterWidget from "metabase/query_builder/components/filters/FilterWidget";
import RunButton from "metabase/query_builder/components/RunButton";

import { TestTable } from "metabase/visualizations/visualizations/Table";

import * as Urls from "metabase/lib/urls";

const REVIEW_PRODUCT_ID = 32;
const REVIEW_RATING_ID = 33;
const PRODUCT_TITLE_ID = 27;

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

const initQBWithReviewsTable = initQbWithDbAndTable(1, 4);

describe("QueryBuilder", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("remapping", () => {
    beforeAll(async () => {
      // add remappings
      const store = await createTestStore();

      // NOTE Atte Keinänen 8/7/17:
      // We test here the full dimension functionality which lets you enter a dimension name that differs
      // from the field name. This is something that field settings UI doesn't let you to do yet.

      await store.dispatch(
        updateFieldDimension(REVIEW_PRODUCT_ID, {
          type: "external",
          name: "Product Name",
          human_readable_field_id: PRODUCT_TITLE_ID,
        }),
      );

      await store.dispatch(
        updateFieldDimension(REVIEW_RATING_ID, {
          type: "internal",
          name: "Rating Description",
          human_readable_field_id: null,
        }),
      );
      await store.dispatch(
        updateFieldValues(REVIEW_RATING_ID, [
          [1, "Awful"],
          [2, "Unpleasant"],
          [3, "Meh"],
          [4, "Enjoyable"],
          [5, "Perfecto"],
        ]),
      );
    });

    describe("for Rating category field with custom field values", () => {
      // The following test case is very similar to earlier filter tests but in this case we use remapped values
      it("lets you add 'Rating is Perfecto' filter", async () => {
        const { store, qb } = await initQBWithReviewsTable();

        // open filter popover
        const filterSection = qb.find(".GuiBuilder-filtered-by");
        const newFilterButton = filterSection.find(".AddButton");
        click(newFilterButton);

        // choose the field to be filtered
        const filterPopover = filterSection.find(FilterPopover);
        const ratingFieldButton = filterPopover
          .find(FieldList)
          .find('h4[children="Rating Description"]');
        expect(ratingFieldButton.length).toBe(1);
        click(ratingFieldButton);

        // check that field values seem correct
        const fieldItems = filterPopover.find("li");
        expect(fieldItems.length).toBe(5);
        expect(fieldItems.first().text()).toBe("Awful");
        expect(fieldItems.last().text()).toBe("Perfecto");

        // select the last item (Perfecto)
        const widgetFieldItem = fieldItems.last();
        const widgetCheckbox = widgetFieldItem.find(CheckBox);
        expect(widgetCheckbox.props().checked).toBe(false);
        click(widgetFieldItem.children().first());
        expect(widgetCheckbox.props().checked).toBe(true);

        // add the filter
        const addFilterButton = filterPopover.find(
          'button[children="Add filter"]',
        );
        clickButton(addFilterButton);

        await store.waitForActions([SET_DATASET_QUERY]);

        // validate the filter text value
        expect(qb.find(FilterPopover).length).toBe(0);
        const filterWidget = qb.find(FilterWidget);
        expect(filterWidget.length).toBe(1);
        expect(filterWidget.text()).toBe(
          "Rating Description is equal toPerfecto",
        );
      });

      it("shows remapped value correctly in Raw Data query with Table visualization", async () => {
        const { store, qb } = await initQBWithReviewsTable();

        clickButton(qb.find(RunButton));
        await store.waitForActions([QUERY_COMPLETED]);

        const table = qb.find(TestTable);
        const headerCells = table
          .find("thead tr")
          .first()
          .find("th");
        const firstRowCells = table
          .find("tbody tr")
          .first()
          .find("td");

        expect(headerCells.length).toBe(6);
        expect(headerCells.at(4).text()).toBe("Rating Description");

        expect(firstRowCells.length).toBe(6);

        expect(firstRowCells.at(4).text()).toBe("Perfecto");
      });
    });

    describe("for Product ID FK field with a FK remapping", () => {
      it("shows remapped values correctly in Raw Data query with Table visualization", async () => {
        const { store, qb } = await initQBWithReviewsTable();

        clickButton(qb.find(RunButton));
        await store.waitForActions([QUERY_COMPLETED]);

        const table = qb.find(TestTable);
        const headerCells = table
          .find("thead tr")
          .first()
          .find("th");
        const firstRowCells = table
          .find("tbody tr")
          .first()
          .find("td");

        expect(headerCells.length).toBe(6);
        expect(headerCells.at(3).text()).toBe("Product Name");

        expect(firstRowCells.length).toBe(6);

        expect(firstRowCells.at(3).text()).toBe("Awesome Wooden Pants");
      });
    });

    afterAll(async () => {
      const store = await createTestStore();

      await store.dispatch(deleteFieldDimension(REVIEW_PRODUCT_ID));
      await store.dispatch(deleteFieldDimension(REVIEW_RATING_ID));

      await store.dispatch(
        updateFieldValues(REVIEW_RATING_ID, [
          [1, "1"],
          [2, "2"],
          [3, "3"],
          [4, "4"],
          [5, "5"],
        ]),
      );
    });
  });
});
