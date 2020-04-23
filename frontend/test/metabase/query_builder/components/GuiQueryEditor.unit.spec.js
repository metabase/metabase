import React from "react";
import { shallow } from "enzyme";

import GuiQueryEditor from "metabase/query_builder/components/GuiQueryEditor";
import Question from "metabase-lib/lib/Question";
import {
  SAMPLE_DATASET,
  ORDERS,
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
    isShowingDataReference={false}
  />
);

describe("GuiQueryEditor", () => {
  it("should allow adding the first breakout", () => {
    const query: StructuredQuery = Question.create({
      databaseId: SAMPLE_DATASET.id,
      tableId: ORDERS.id,
      metadata,
    })
      .query()
      .aggregate(["count"]);

    const component = shallow(getGuiQueryEditor(query));

    // The add button is a BreakoutWidget React component
    expect(component.find("BreakoutWidget").length).toBe(1);
  });
  it("should allow adding more than one breakout", () => {
    const query: StructuredQuery = Question.create({
      databaseId: SAMPLE_DATASET.id,
      tableId: ORDERS.id,
      metadata,
    })
      .query()
      .aggregate(["count"])
      .breakout(["field-id", ORDERS.TOTAL.id]);

    const component = shallow(getGuiQueryEditor(query));

    // Both the first breakout and the add button which both are the same BreakoutWidget React component
    expect(component.find("BreakoutWidget").length).toBe(2);
  });
});
