import { PRODUCT_ANALYTICS_SETTINGS_KEY } from "metabase-types/api";

import {
  getProductAnalyticsDefinition,
  isProductAnalyticsCard,
} from "./product-analytics";

const DEFINITION = {
  version: 1,
  kind: "funnel",
  table_id: 42,
  settings: { "funnel.view": "overTime" },
};

describe("getProductAnalyticsDefinition", () => {
  it("reads a valid definition", () => {
    expect(
      getProductAnalyticsDefinition({
        "graph.metrics": ["people"],
        [PRODUCT_ANALYTICS_SETTINGS_KEY]: DEFINITION,
      }),
    ).toEqual(DEFINITION);
  });

  it.each([
    ["no settings", undefined],
    ["a definition with no fields", {}],
    ["an unknown kind", { ...DEFINITION, kind: "retention" }],
    ["an unknown version", { ...DEFINITION, version: 2 }],
    ["a missing table", { ...DEFINITION, table_id: undefined }],
    ["a virtual table", { ...DEFINITION, table_id: "card__1" }],
    ["settings that aren't an object", { ...DEFINITION, settings: [] }],
  ])("rejects %s", (_name, definition) => {
    expect(
      getProductAnalyticsDefinition(
        definition === undefined
          ? undefined
          : { [PRODUCT_ANALYTICS_SETTINGS_KEY]: definition },
      ),
    ).toBeUndefined();
  });

  it("identifies analysis cards", () => {
    expect(
      isProductAnalyticsCard({
        visualization_settings: {
          [PRODUCT_ANALYTICS_SETTINGS_KEY]: DEFINITION,
        },
      }),
    ).toBe(true);
    expect(isProductAnalyticsCard({ visualization_settings: {} })).toBe(false);
  });
});
