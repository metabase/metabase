import React from "react";
import { shallow } from "enzyme";

import GuiQueryEditor, {
  BreakoutWidget,
} from "../../../src/metabase/query_builder/components/GuiQueryEditor";
import Question from "metabase-lib/lib/Question";
import {
  DATABASE_ID,
  ORDERS_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
  metadata,
} from "__support__/sample_dataset_fixture";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

const getGuiQueryEditor = query => (
  <GuiQueryEditor
    query={query}
    databases={metadata.databasesList()}
    tables={metadata.tablesList()}
    setDatabaseFn={() => {}}
    setSourceTableFn={() => {}}
    setDatasetQuery={() => {}}
    isShowingTutorial={false}
    isShowingDataReference={false}
  />
);

describe("GuiQueryEditor", () => {
  it("should allow adding the first breakout", () => {
    const query: StructuredQuery = Question.create({
      databaseId: DATABASE_ID,
      tableId: ORDERS_TABLE_ID,
      metadata,
    })
      .query()
      .addAggregation(["count"]);

    const component = shallow(getGuiQueryEditor(query));

    // The add button is a BreakoutWidget React component
    expect(component.find(BreakoutWidget).length).toBe(1);
  });
  it("should allow adding more than one breakout", () => {
    const query: StructuredQuery = Question.create({
      databaseId: DATABASE_ID,
      tableId: ORDERS_TABLE_ID,
      metadata,
    })
      .query()
      .addAggregation(["count"])
      .addBreakout(["field-id", ORDERS_TOTAL_FIELD_ID]);

    const component = shallow(getGuiQueryEditor(query));

    // Both the first breakout and the add button which both are the same BreakoutWidget React component
    expect(component.find(BreakoutWidget).length).toBe(2);
  });
});
