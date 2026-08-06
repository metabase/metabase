import type { ContentTranslationFunction } from "metabase/content-translation/types";
import { getTranslatedFilterDisplayName } from "metabase/querying/filters/utils/display";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER, columnFinder } from "metabase-lib/test-helpers";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import { getDetailedTranslatedFilterDisplayName } from "./candidate-filter-display";

const tc: ContentTranslationFunction = (value) => value;

function createQueryWithFilter(
  columnName: string,
  values: Array<string | number | boolean>,
) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        filters: [
          {
            type: "operator",
            operator: "=",
            args: [
              { type: "column", sourceName: "PRODUCTS", name: columnName },
              ...values.map((value) => ({ type: "literal" as const, value })),
            ],
          },
        ],
      },
    ],
  });
  const [filter] = Lib.filters(query, 0);

  return { query, filter };
}

describe("getDetailedTranslatedFilterDisplayName", () => {
  it("shows short multi-value selections instead of their count", () => {
    const { query, filter } = createQueryWithFilter("CATEGORY", [
      "Gadget",
      "Widget",
    ]);

    expect(getTranslatedFilterDisplayName(query, 0, filter, tc, "en")).toBe(
      "Category is 2 selections",
    );
    expect(
      getDetailedTranslatedFilterDisplayName(query, 0, filter, tc, "en"),
    ).toBe("Category is one of Gadget, Widget");
  });

  it("truncates long selections after three values", () => {
    const { query, filter } = createQueryWithFilter("CATEGORY", [
      "Gadget",
      "Widget",
      "Doohickey",
      "Contraption",
      "Gizmo",
    ]);

    expect(
      getDetailedTranslatedFilterDisplayName(query, 0, filter, tc, "en"),
    ).toBe("Category is one of Gadget, Widget, Doohickey +2 more");
  });

  it("keeps Lib's display name for a single value", () => {
    const { query, filter } = createQueryWithFilter("CATEGORY", ["Gadget"]);

    expect(
      getDetailedTranslatedFilterDisplayName(query, 0, filter, tc, "en"),
    ).toBe("Category is Gadget");
  });

  it("shows numeric identifier selections", () => {
    const { query, filter } = createQueryWithFilter("ID", [1, 2, 3]);

    expect(
      getDetailedTranslatedFilterDisplayName(query, 0, filter, tc, "en"),
    ).toBe("ID is one of 1, 2, 3");
  });

  it("shows specific date selections", () => {
    const baseQuery = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
    });
    const columns = Lib.filterableColumns(baseQuery, 0);
    const column = columnFinder(baseQuery, columns)("PRODUCTS", "CREATED_AT");
    const query = Lib.filter(
      baseQuery,
      0,
      Lib.specificDateFilterClause({
        operator: "=",
        column,
        values: [new Date(2024, 0, 1), new Date(2024, 1, 2)],
        hasTime: false,
      }),
    );
    const [filter] = Lib.filters(query, 0);

    expect(
      getDetailedTranslatedFilterDisplayName(query, 0, filter, tc, "en"),
    ).toBe("Created At is one of January 1, 2024, February 2, 2024");
  });
});
