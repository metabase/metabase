import { render, screen } from "@testing-library/react";
import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import Question from "metabase-lib/Question";
import { GuiQueryEditor } from "./GuiQueryEditor";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const getGuiQueryEditor = legacyQuery => (
  <GuiQueryEditor
    legacyQuery={legacyQuery}
    query={legacyQuery.getMLv2Query()}
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
    const legacyQuery = Question.create({
      databaseId: SAMPLE_DB_ID,
      tableId: ORDERS_ID,
      metadata,
    })
      .legacyQuery({ useStructuredQuery: true })
      .aggregate(["count"]);

    render(getGuiQueryEditor(legacyQuery));
    const ADD_ICONS = screen.getAllByRole("img", { name: /add/i });

    screen.getByText("Add a grouping");
    // 1. Filter, 2. Count, 3. Group-by
    expect(ADD_ICONS.length).toBe(3);
  });

  it("should allow adding more than one breakout", () => {
    const legacyQuery = Question.create({
      databaseId: SAMPLE_DB_ID,
      tableId: ORDERS_ID,
      metadata,
    })
      .legacyQuery({ useStructuredQuery: true })
      .aggregate(["count"])
      .breakout(["field", ORDERS.TOTAL, null]);

    render(getGuiQueryEditor(legacyQuery));
    const ADD_ICONS = screen.getAllByRole("img", { name: /add/i });

    screen.getByText("Total");
    screen.getByRole("img", { name: /close/i }); // Now we can close the first breakout
    // 1. Filter, 2. Count, 3. Group-by (new add icon after the first breakout)
    expect(ADD_ICONS.length).toBe(3);
  });
});
