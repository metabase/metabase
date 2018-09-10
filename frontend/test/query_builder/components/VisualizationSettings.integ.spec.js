import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";
import { click } from "__support__/enzyme_utils";

import React from "react";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import {
  INITIALIZE_QB,
  QUERY_COMPLETED,
  setQueryDatabase,
  setQuerySourceTable,
} from "metabase/query_builder/actions";

import { FETCH_TABLE_METADATA } from "metabase/redux/metadata";

import RunButton from "metabase/query_builder/components/RunButton";

import VisualizationSettings from "metabase/query_builder/components/VisualizationSettings";
import TableSimple from "metabase/visualizations/components/TableSimple";
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

const initQBWithReviewsTable = initQbWithDbAndTable(1, 4);

describe("QueryBuilder", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("visualization settings", () => {
    it("lets you hide a field for a raw data table", async () => {
      const { store, qb } = await initQBWithReviewsTable();

      // Run the raw data query
      click(qb.find(RunButton));
      await store.waitForActions([QUERY_COMPLETED]);

      const vizSettings = qb.find(VisualizationSettings);
      click(vizSettings.find(".Icon-gear"));

      const settingsModal = vizSettings.find(".test-modal");
      const table = settingsModal.find(TableSimple);

      expect(table.find('div[children="Created At"]').length).toBe(1);

      const doneButton = settingsModal.find(".Button--primary");
      expect(doneButton.length).toBe(1);

      const fieldsToIncludeRemoveButtons = settingsModal.find(".Icon-close");
      expect(fieldsToIncludeRemoveButtons.length).toBe(6);

      click(
        settingsModal
          .find("ColumnItem")
          .findWhere(x => x.text() === "Created At")
          .find(".Icon-close"),
      );

      expect(table.find('div[children="Created At"]').length).toBe(0);

      // Save the settings
      click(doneButton);
      expect(vizSettings.find(".test-modal").length).toBe(0);

      // Don't test the contents of actual table visualization here as react-virtualized doesn't seem to work
      // very well together with Enzyme
    });
  });
});
