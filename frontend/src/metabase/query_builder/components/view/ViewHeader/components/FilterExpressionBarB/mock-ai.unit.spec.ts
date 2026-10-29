import { createQuery } from "metabase/querying/filters/components/FilterPicker/test-utils";

import { getMockAiItems } from "./mock-ai";
import { getFilterSchema } from "./schema";

function setup() {
  return getFilterSchema(createQuery(), -1);
}

function getAttrs(prompt: string) {
  const schema = setup();
  return getMockAiItems(prompt, schema)?.map((item) => {
    if (!("attrs" in item)) {
      throw new Error("Expected a filter pill");
    }
    const field = schema.getField(item.attrs.columnKey);
    return {
      field: field?.label,
      operator: item.attrs.operatorKey,
      values: item.attrs.values,
    };
  });
}

describe("getMockAiItems", () => {
  it("resolves a prompt to filters on the table's columns", () => {
    expect(getAttrs("west coast customers")).toEqual([
      { field: "State", operator: "=", values: ["CA", "OR", "WA"] },
    ]);
  });

  it("resolves a prompt to several filters", () => {
    expect(getAttrs("cheap gadgets")).toEqual([
      { field: "Category", operator: "=", values: ["Gadget"] },
      { field: "Price", operator: "<", values: ["30"] },
    ]);
  });

  it("does not resolve a prompt when the table lacks its column", () => {
    expect(getAttrs("francophone countries")).toBeUndefined();
  });

  it("does not resolve an unknown prompt", () => {
    expect(getAttrs("something else")).toBeUndefined();
  });
});
