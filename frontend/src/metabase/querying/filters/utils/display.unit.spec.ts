import type { ContentTranslationFunction } from "metabase/content-translation/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import {
  getDetailedTranslatedFilterDisplayName,
  getTranslatedFilterDisplayName,
} from "./display";

const tc: ContentTranslationFunction = (value) => value;

function createQueryWithCategoryFilter(values: string[]) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        filters: [
          {
            type: "operator",
            operator: "=",
            args: [
              { type: "column", sourceName: "PRODUCTS", name: "CATEGORY" },
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
    const { query, filter } = createQueryWithCategoryFilter([
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
    const { query, filter } = createQueryWithCategoryFilter([
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
    const { query, filter } = createQueryWithCategoryFilter(["Gadget"]);

    expect(
      getDetailedTranslatedFilterDisplayName(query, 0, filter, tc, "en"),
    ).toBe("Category is Gadget");
  });
});
