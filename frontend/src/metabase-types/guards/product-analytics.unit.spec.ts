import {
  PRODUCT_ANALYTICS_DOCUMENT_ATTR,
  PRODUCT_ANALYTICS_SETTINGS_KEY,
} from "metabase-types/api";

import {
  getProductAnalyticsDefinition,
  getProductAnalyticsDocumentContext,
  getProductAnalyticsNodeDefinition,
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

describe("getProductAnalyticsNodeDefinition", () => {
  it("reads a valid definition", () => {
    const definition = { version: 1, kind: "paths", settings: {} };
    expect(getProductAnalyticsNodeDefinition(definition)).toEqual(definition);
  });

  it.each([
    ["nothing", null],
    ["an unknown kind", { version: 1, kind: "retention", settings: {} }],
    ["no settings", { version: 1, kind: "funnel" }],
    ["another version", { version: 2, kind: "funnel", settings: {} }],
  ])("rejects %s", (_name, value) => {
    expect(getProductAnalyticsNodeDefinition(value)).toBeUndefined();
  });
});

describe("getProductAnalyticsDocumentContext", () => {
  const CONTEXT = { version: 1, table_id: 42, date_range: "past30days" };

  it("reads the context from the doc node", () => {
    expect(
      getProductAnalyticsDocumentContext({
        attrs: { [PRODUCT_ANALYTICS_DOCUMENT_ATTR]: CONTEXT },
      }),
    ).toEqual(CONTEXT);
  });

  it("keeps a document without a table", () => {
    expect(
      getProductAnalyticsDocumentContext({
        attrs: {
          [PRODUCT_ANALYTICS_DOCUMENT_ATTR]: {
            ...CONTEXT,
            table_id: "card__1",
          },
        },
      }),
    ).toEqual({ ...CONTEXT, table_id: null });
  });

  it.each([
    ["no content", undefined],
    ["no attrs", {}],
    ["no context", { attrs: { other: true } }],
    [
      "no date range",
      { attrs: { [PRODUCT_ANALYTICS_DOCUMENT_ATTR]: { version: 1 } } },
    ],
  ])("is undefined for %s", (_name, content) => {
    expect(getProductAnalyticsDocumentContext(content)).toBeUndefined();
  });
});
