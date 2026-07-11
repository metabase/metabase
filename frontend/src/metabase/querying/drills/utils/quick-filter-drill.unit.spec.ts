import { createMockMetadata } from "__support__/metadata";
import type { ClickAction } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { queryDrill } from "./query-drill";

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });

function getOrdersQuestion() {
  const card = createMockCard({
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: { "source-table": ORDERS_ID },
    },
  });
  return new Question(card, metadata);
}

function getQuickFilterActions(value: unknown): ClickAction[] {
  const question = getOrdersQuestion();
  const actions = queryDrill(
    question,
    { column: createOrdersCreatedAtDatasetColumn(), value },
    () => true,
  );
  return actions.filter((action) => action.name?.startsWith("quick-filter."));
}

describe("quickFilterDrill > date/time empty filter options (metabase#44101)", () => {
  it("labels the empty-value date/time drills 'Is empty' and 'Not empty'", () => {
    const actions = getQuickFilterActions(null);

    const equalsAction = actions.find(
      (action) => action.name === "quick-filter.=",
    );
    const notEqualsAction = actions.find(
      (action) => action.name === "quick-filter.≠",
    );

    expect(equalsAction?.title).toBe("Is empty");
    expect(notEqualsAction?.title).toBe("Not empty");
    expect(equalsAction?.sectionTitle).toBe("Filter by this date and time");
  });

  it("still labels non-empty date/time drills with the temporal operators", () => {
    const actions = getQuickFilterActions("2024-01-01T00:00:00Z");

    const titles = actions.map((action) => action.title);
    expect(titles).toEqual(expect.arrayContaining(["On", "Not on"]));
    expect(titles).not.toContain("Is empty");
    expect(titles).not.toContain("Not empty");
  });
});
