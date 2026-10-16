import {
  createMockCard,
  createMockDashboard,
  createMockDocument,
} from "metabase-types/api/mocks";

import { filterContentItems, getContentItemUrl, isSavedToOwner } from "./utils";

const ORDERS = createMockCard({ id: 1, name: "Orders" });
const REVENUE = createMockCard({ id: 2, name: "Revenue", type: "metric" });
const CUSTOMERS = createMockCard({ id: 3, name: "Customers", type: "model" });

describe("filterContentItems", () => {
  const items = [ORDERS, REVENUE, CUSTOMERS];

  it("matches names case-insensitively", () => {
    expect(filterContentItems(items, "  rEv ")).toEqual([REVENUE]);
  });

  it("returns every item for a blank query", () => {
    expect(filterContentItems(items, " ")).toEqual(items);
  });
});

describe("getContentItemUrl", () => {
  it("opens a metric saved in the Library in Data Studio", () => {
    expect(getContentItemUrl(REVENUE, "library-metrics")).toBe(
      "/data-studio/library/metrics/2",
    );
  });

  it("opens a metric saved outside the Library in the main app", () => {
    expect(getContentItemUrl(REVENUE, undefined)).toBe("/metric/2-revenue");
    expect(getContentItemUrl(REVENUE, "instance-analytics")).toBe(
      "/metric/2-revenue",
    );
  });

  it("opens questions and models in the main app, even in the Library", () => {
    expect(getContentItemUrl(ORDERS, undefined)).toBe("/question/1-orders");
    expect(getContentItemUrl(CUSTOMERS, "library-data")).toBe(
      "/model/3-customers",
    );
  });
});

describe("isSavedToOwner", () => {
  const dashboard = createMockDashboard({ id: 7, name: "Sales overview" });
  const document = createMockDocument({ id: 7, name: "Quarterly review" });

  it("matches a dashboard question to its dashboard only", () => {
    const card = createMockCard({ dashboard_id: 7, document_id: null });

    expect(isSavedToOwner(card, { ...dashboard, model: "dashboard" })).toBe(
      true,
    );
    expect(isSavedToOwner(card, { ...document, model: "document" })).toBe(
      false,
    );
  });

  it("does not match a document question moved to another collection", () => {
    const card = createMockCard({ document_id: 7, collection_id: 3 });

    expect(
      isSavedToOwner(card, {
        ...document,
        collection_id: 2,
        model: "document",
      }),
    ).toBe(false);
  });

  it("matches a document question to its document only", () => {
    const card = createMockCard({ dashboard_id: null, document_id: 7 });

    expect(isSavedToOwner(card, { ...document, model: "document" })).toBe(true);
    expect(isSavedToOwner(card, { ...dashboard, model: "dashboard" })).toBe(
      false,
    );
  });
});
