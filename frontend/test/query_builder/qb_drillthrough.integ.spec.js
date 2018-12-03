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
  setDatasetQuery,
  NAVIGATE_TO_NEW_CARD,
  UPDATE_URL,
} from "metabase/query_builder/actions";

import QueryHeader from "metabase/query_builder/components/QueryHeader";
import { FETCH_TABLE_METADATA } from "metabase/redux/metadata";

import RunButton from "metabase/query_builder/components/RunButton";

import BreakoutWidget from "metabase/query_builder/components/BreakoutWidget";
import { getCard } from "metabase/query_builder/selectors";
import { TestTable } from "metabase/visualizations/visualizations/Table";
import ChartClickActions, {
  ChartClickAction,
} from "metabase/visualizations/components/ChartClickActions";

import { delay } from "metabase/lib/promise";
import * as Urls from "metabase/lib/urls";
import DataSelector, {
  TableTriggerContent,
} from "metabase/query_builder/components/DataSelector";
import ObjectDetail from "metabase/visualizations/visualizations/ObjectDetail";

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

describe("QueryBuilder", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("drill-through", () => {
    describe("View details action", () => {
      it("works for foreign keys", async () => {
        const { store, qb } = await initQbWithOrdersTable();
        click(qb.find(RunButton));
        await store.waitForActions([QUERY_COMPLETED]);
        const table = qb.find(TestTable);

        expect(
          qb
            .find(DataSelector)
            .find(TableTriggerContent)
            .text(),
        ).toBe("Orders");
        const headerCells = table.find("thead th").map(cell => cell.text());
        const productIdIndex = headerCells.indexOf("Product ID");

        const firstRowCells = table
          .find("tbody tr")
          .first()
          .find("td");
        const productIdCell = firstRowCells.at(productIdIndex);
        click(productIdCell.children().first());

        // Drill-through is delayed in handleVisualizationClick of Visualization.jsx by 100ms
        await delay(150);

        const viewDetailsButton = qb
          .find(ChartClickActions)
          .find(ChartClickAction)
          .filterWhere(action => /View details/.test(action.text()))
          .first();

        click(viewDetailsButton);

        await store.waitForActions([
          NAVIGATE_TO_NEW_CARD,
          UPDATE_URL,
          QUERY_COMPLETED,
        ]);

        expect(qb.find(ObjectDetail).length).toBe(1);
        expect(
          qb
            .find(DataSelector)
            .find(TableTriggerContent)
            .text(),
        ).toBe("Products");
      });
    });
    describe("Zoom In action for broken out fields", () => {
      it("works for Count of rows aggregation and Subtotal 50 Bins breakout", async () => {
        const { store, qb } = await initQbWithOrdersTable();
        await store.dispatch(
          setDatasetQuery({
            database: 1,
            type: "query",
            query: {
              "source-table": 1,
              breakout: [["binning-strategy", ["field-id", 6], "num-bins", 50]],
              aggregation: [["count"]],
            },
          }),
        );

        click(qb.find(RunButton));
        await store.waitForActions([QUERY_COMPLETED]);

        const table = qb.find(TestTable);
        const firstRowCells = table
          .find("tbody tr")
          .first()
          .find("td");
        expect(firstRowCells.length).toBe(2);

        // NOTE: Commented out due to the randomness involved in sample dataset generation
        // which sometimes causes the cell value to be different
        // expect(firstRowCells.first().text()).toBe("4  –  6");

        const countCell = firstRowCells.last();
        expect(countCell.text()).toBe("2");
        click(countCell.children().first());

        // Drill-through is delayed in handleVisualizationClick of Visualization.jsx by 100ms
        await delay(150);

        click(qb.find(ChartClickActions).find('div[children="Zoom in"]'));

        store.waitForActions([
          NAVIGATE_TO_NEW_CARD,
          UPDATE_URL,
          QUERY_COMPLETED,
        ]);

        // Should reset to auto binning
        const breakoutWidget = qb.find(BreakoutWidget).first();
        expect(breakoutWidget.text()).toBe("Total: Auto binned");

        // Expecting to see the correct lineage (just a simple sanity check)
        const title = qb.find(QueryHeader).find("h1");
        expect(title.text()).toBe("New question");
      });

      it("works for Count of rows aggregation and FK State breakout", async () => {
        const { store, qb } = await initQbWithOrdersTable();
        await store.dispatch(
          setDatasetQuery({
            database: 1,
            type: "query",
            query: {
              "source-table": 1,
              breakout: [["fk->", 7, 19]],
              aggregation: [["count"]],
            },
          }),
        );

        click(qb.find(RunButton));
        await store.waitForActions([QUERY_COMPLETED]);

        const table = qb.find(TestTable);
        const firstRowCells = table
          .find("tbody tr")
          .first()
          .find("td");
        expect(firstRowCells.length).toBe(2);

        expect(firstRowCells.first().text()).toBe("AK");

        const countCell = firstRowCells.last();
        expect(countCell.text()).toBe("474");
        click(countCell.children().first());

        // Drill-through is delayed in handleVisualizationClick of Visualization.jsx by 100ms
        await delay(150);

        click(qb.find(ChartClickActions).find('div[children="Zoom in"]'));

        store.waitForActions([
          NAVIGATE_TO_NEW_CARD,
          UPDATE_URL,
          QUERY_COMPLETED,
        ]);

        // Should reset to auto binning
        const breakoutWidgets = qb.find(BreakoutWidget);
        expect(breakoutWidgets.length).toBe(3);
        expect(breakoutWidgets.at(0).text()).toBe("UserLatitude: 1°");
        expect(breakoutWidgets.at(1).text()).toBe("UserLongitude: 1°");

        // Should have visualization type set to Pin map (temporary workaround until we have polished heat maps)
        const card = getCard(store.getState());
        expect(card.display).toBe("map");
        expect(card.visualization_settings).toEqual({ "map.type": "grid" });
      });

      it("works for Count of rows aggregation and FK Latitude Auto binned breakout", async () => {
        const { store, qb } = await initQbWithOrdersTable();
        await store.dispatch(
          setDatasetQuery({
            database: 1,
            type: "query",
            query: {
              "source-table": 1,
              breakout: [["binning-strategy", ["fk->", 7, 14], "default"]],
              aggregation: [["count"]],
            },
          }),
        );

        click(qb.find(RunButton));
        await store.waitForActions([QUERY_COMPLETED]);

        const table = qb.find(TestTable);
        const firstRowCells = table
          .find("tbody tr")
          .first()
          .find("td");
        expect(firstRowCells.length).toBe(2);

        expect(firstRowCells.first().text()).toBe("20° N  –  30° N");

        const countCell = firstRowCells.last();
        expect(countCell.text()).toBe("579");
        click(countCell.children().first());

        // Drill-through is delayed in handleVisualizationClick of Visualization.jsx by 100ms
        await delay(150);

        click(qb.find(ChartClickActions).find('div[children="Zoom in"]'));

        store.waitForActions([
          NAVIGATE_TO_NEW_CARD,
          UPDATE_URL,
          QUERY_COMPLETED,
        ]);

        // Should reset to auto binning
        const breakoutWidgets = qb.find(BreakoutWidget);
        expect(breakoutWidgets.length).toBe(2);

        // Default location binning strategy currently has a bin width of 10° so
        expect(breakoutWidgets.at(0).text()).toBe("UserLatitude: 1°");

        // Should have visualization type set to the previous visualization
        const card = getCard(store.getState());
        expect(card.display).toBe("bar");

        // Some part of visualization seems to be asynchronous, causing a cluster of errors
        // about missing query results if this delay isn't present
        await delay(100);
      });
    });
  });
});
