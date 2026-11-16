import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { PRODUCTS, PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import {
  findEventNameColumn,
  formatEventName,
  getEventNameValue,
  withEventNameCondition,
} from "./event-name";

const PRODUCTS_QUERY = Lib.queryFromTableOrCardMetadata(
  SAMPLE_PROVIDER,
  checkNotNull(Lib.tableOrCardMetadata(SAMPLE_PROVIDER, PRODUCTS_ID)),
);

const withCondition = (fieldId: number, value: string) =>
  withEventNameCondition(
    PRODUCTS_QUERY,
    checkNotNull(findEventNameColumn(PRODUCTS_QUERY, fieldId)),
    value,
  );

describe("formatEventName", () => {
  it.each([
    ["subscription_cancelled", "Subscription cancelled"],
    ["checkout.completed", "Checkout completed"],
    ["page-view", "Page view"],
    ["Order Completed", "Order Completed"],
    ["signUp", "signUp"],
    ["$pageview", "$pageview"],
    ["___", "___"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatEventName(value)).toBe(expected);
  });
});

describe("getEventNameValue", () => {
  it("reads the event name a condition built for it picks", () => {
    const query = withCondition(PRODUCTS.CATEGORY, "Widget");

    expect(getEventNameValue(query, PRODUCTS.CATEGORY)).toBe("Widget");
  });

  it("reads it from a saved definition", () => {
    const built = withCondition(PRODUCTS.CATEGORY, "Widget");
    const query = Lib.fromJsQuery(SAMPLE_PROVIDER, Lib.toJsQuery(built));

    expect(getEventNameValue(query, PRODUCTS.CATEGORY)).toBe("Widget");
  });

  it("is null for a condition on another column", () => {
    const query = withCondition(PRODUCTS.VENDOR, "Widget");

    expect(getEventNameValue(query, PRODUCTS.CATEGORY)).toBeNull();
  });
});
