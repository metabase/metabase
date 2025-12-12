import type { SdkBreadcrumbItem } from "embedding-sdk-bundle/types/breadcrumb";

import { updateBreadcrumbsWithItem as update } from "./update-breadcrumbs";

const createItem = (
  id: number,
  type: SdkBreadcrumbItem["type"],
): SdkBreadcrumbItem => ({ id, name: "F", type });

describe("updateBreadcrumbsWithItem", () => {
  it("appends or replaces the breadcrumb stack", () => {
    const collection1 = createItem(1, "collection");
    const dashboardA = createItem(2, "dashboard");
    const dashboardB = createItem(3, "dashboard");
    const question = createItem(4, "question");

    let breadcrumbs: SdkBreadcrumbItem[] = [];

    // Should append to breadcrumbs
    breadcrumbs = update(breadcrumbs, collection1);
    breadcrumbs = update(breadcrumbs, dashboardA);
    expect(breadcrumbs).toEqual([collection1, dashboardA]);

    // Navigating to question from dashboard should not add question to breadcrumbs
    breadcrumbs = update(breadcrumbs, question);
    expect(breadcrumbs).toEqual([collection1, dashboardA]);

    // Navigation to dashboard should replace the dashboard
    breadcrumbs = update(breadcrumbs, dashboardB);
    expect(breadcrumbs).toEqual([collection1, dashboardB]);
  });

  it("pops the breadcrumb stack after navigating to an existing collection", () => {
    const collectionA = createItem(1, "collection");
    const collectionB = createItem(2, "collection");
    const collectionC = createItem(3, "collection");
    const dashboard = createItem(4, "dashboard");

    let breadcrumbs = update([], collectionA);
    breadcrumbs = update(breadcrumbs, collectionB);
    breadcrumbs = update(breadcrumbs, collectionC);
    breadcrumbs = update(breadcrumbs, dashboard);

    expect(breadcrumbs).toEqual([
      collectionA,
      collectionB,
      collectionC,
      dashboard,
    ]);

    // Navigating back should remove previous collections
    breadcrumbs = update(breadcrumbs, collectionB);
    expect(breadcrumbs).toEqual([collectionA, collectionB]);
    breadcrumbs = update(breadcrumbs, collectionA);
    expect(breadcrumbs).toEqual([collectionA]);
  });
});
