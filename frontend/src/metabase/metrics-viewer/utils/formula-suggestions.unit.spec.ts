import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { StructuredQuery } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

import {
  getFormulaSuggestions,
  getGroupingSuggestions,
} from "./formula-suggestions";

function createQuery(query: StructuredQuery = {}) {
  return new Question(
    createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PRODUCTS_ID, ...query },
      },
    }),
    SAMPLE_METADATA,
  ).query();
}

describe("getFormulaSuggestions", () => {
  it("suggests common calculations on the table's own columns", () => {
    const labels = getFormulaSuggestions(createQuery()).map(
      (suggestion) => suggestion.label,
    );
    expect(labels).toEqual(
      expect.arrayContaining(["Count", "Sum of Price", "Average of Price"]),
    );
    expect(labels).not.toContain("Sum of ID");
    expect(labels).not.toContain("Distinct values of Title");
  });

  it("puts relatives of existing calculations first and skips ones already there", () => {
    const suggestions = getFormulaSuggestions(
      createQuery({ aggregation: [["sum", ["field", PRODUCTS.PRICE, null]]] }),
    );
    expect(suggestions[0]).toMatchObject({
      label: "Average of Price",
      kind: "related",
    });
    expect(suggestions.map((suggestion) => suggestion.label)).not.toContain(
      "Sum of Price",
    );
  });

  it("returns formulas that compile to the suggested calculation", () => {
    const [suggestion] = getFormulaSuggestions(createQuery());
    expect(suggestion.source).toBe("Count()");
  });
});

describe("getGroupingSuggestions", () => {
  it("offers category and date columns from the table, skipping unique ones, dates bucketed", () => {
    const query = createQuery();
    const suggestions = getGroupingSuggestions(query);
    const labels = suggestions.map((suggestion) => suggestion.label);
    expect(labels).toEqual(["Category", "Vendor", "Created At: Month"]);
    expect(labels).not.toContain("Title");
    const createdAt = suggestions.find(
      (suggestion) => suggestion.label === "Created At: Month",
    );
    expect(createdAt && Lib.temporalBucket(createdAt.column)).not.toBeNull();
  });
});
