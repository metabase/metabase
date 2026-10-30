import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import type { RegularClickAction } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getIntegrationClickActions } from "./integration-click-actions";
import { withOrExample } from "./or-filters/harness/examples";

function setup(isSlow = false) {
  const rowsQuery = withOrExample(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    0,
  );
  const total = columnFinder(rowsQuery, Lib.breakoutableColumns(rowsQuery, 0))(
    "ORDERS",
    "TOTAL",
  );
  const query = Lib.breakout(
    Lib.aggregate(
      withOrExample(
        Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
        0,
      ),
      0,
      Lib.expressionClause("count", []),
    ),
    0,
    total,
  );
  const question = new Question(
    createMockCard(),
    createMockMetadata({ databases: [createSampleDatabase()] }),
  ).setQuery(query);
  const actions = getIntegrationClickActions({
    actions: [],
    question,
    isSlow,
    groupCount: 10,
    clicked: {
      column: createMockColumn({
        name: "count",
        display_name: "Count",
        source: "aggregation",
        base_type: "type/Integer",
        field_ref: ["aggregation", 0],
      }),
      value: 10,
      dimensions: [
        {
          value: 200,
          column: createMockColumn({
            name: "TOTAL",
            display_name: "Total",
            source: "breakout",
            base_type: "type/Float",
            field_ref: Lib.legacyRef(query, 0, total),
          }),
        },
      ],
    },
  });
  const action = actions.find(
    (action) => action.name === "integration-chart-filter",
  );
  if (action == null || !("popover" in action)) {
    throw new Error("Expected a chart filter menu");
  }
  const onClick = jest.fn((action: RegularClickAction) => action);
  const Popover = action.popover;
  renderWithProviders(
    <Popover
      series={null}
      onClick={onClick}
      onClose={jest.fn()}
      onChangeCardAndRun={jest.fn()}
      onUpdateVisualizationSettings={jest.fn()}
    />,
  );
  return { onClick };
}

describe("integrated chart filter actions", () => {
  it.each([false, true])(
    "keeps the OR expression and summary when adding a threshold (slow: %s)",
    async (isSlow) => {
      const { onClick } = setup(isSlow);
      await userEvent.click(
        screen.getByRole("button", { name: "Count is at least 10" }),
      );
      const action = onClick.mock.calls[0][0];
      if (!("question" in action)) {
        throw new Error("Expected a question change");
      }
      const query = action.question().query();
      expect(Lib.stageCount(query)).toBe(2);
      expect(Lib.aggregations(query, 0)).toHaveLength(1);
      expect(
        Lib.expressionParts(query, 0, Lib.filters(query, 0)[0]).operator,
      ).toBe("or");
      expect(
        Lib.numberFilterParts(query, 1, Lib.filters(query, 1)[0]),
      ).toMatchObject({ operator: ">=", values: [10] });
      expect(action.questionChangeBehavior).toBe(
        isSlow ? "updateQuestion" : "changeCardAndRun",
      );
    },
  );
});

it("adds a row filter as AND without changing the existing OR group", async () => {
  const { onClick } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Only 200" }));
  const action = onClick.mock.calls[0][0];
  if (!("question" in action)) {
    throw new Error("Expected a question change");
  }
  const query = action.question().query();
  expect(Lib.aggregations(query, 0)).toHaveLength(1);
  const filters = Lib.filters(query, 0);
  expect(filters).toHaveLength(2);
  expect(Lib.expressionParts(query, 0, filters[0]).operator).toBe("or");
  expect(Lib.numberFilterParts(query, 0, filters[1])).toMatchObject({
    operator: "=",
    values: [200],
  });
});
