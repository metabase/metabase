import {
  createMockDataApp,
  createMockDataAppPage,
} from "metabase-types/api/mocks";
import getSelectedItems from "./getSelectedItems";

describe("getSelectedItems", () => {
  const dataApp = createMockDataApp({
    dashboard_id: 2,
    nav_items: [
      { page_id: 1 },
      { page_id: 2 },
      { page_id: 3, indent: 1, hidden: true },
      { page_id: 4, indent: 1 },
    ],
  });

  const pages = [
    createMockDataAppPage({ id: 1 }),
    createMockDataAppPage({ id: 2 }),
    createMockDataAppPage({ id: 3 }),
    createMockDataAppPage({ id: 4 }),
  ];

  it("should select the homepage when no page is selected explicitly", () => {
    expect(
      getSelectedItems({
        dataApp,
        pages,
        selectedItems: [{ type: "data-app", id: dataApp.id }],
      }),
    ).toEqual([{ type: "data-app-page", id: dataApp.dashboard_id }]);
  });

  it("should select the homepage when it's explicitly selected", () => {
    expect(
      getSelectedItems({
        dataApp,
        pages,
        selectedItems: [
          { type: "data-app-page", id: dataApp.dashboard_id as number },
        ],
      }),
    ).toEqual([{ type: "data-app-page", id: dataApp.dashboard_id }]);
  });

  it("should select the first page when no page is selected explicitly and homepage is not set", () => {
    expect(
      getSelectedItems({
        dataApp: { ...dataApp, dashboard_id: null },
        pages,
        selectedItems: [{ type: "data-app", id: dataApp.id }],
      }),
    ).toEqual([{ type: "data-app-page", id: pages[0].id }]);
  });

  it("should select a regular top-level page", () => {
    expect(
      getSelectedItems({
        dataApp,
        pages,
        selectedItems: [{ type: "data-app-page", id: pages[0].id }],
      }),
    ).toEqual([{ type: "data-app-page", id: pages[0].id }]);
  });

  it("should select a regular nested page", () => {
    expect(
      getSelectedItems({
        dataApp,
        pages,
        selectedItems: [{ type: "data-app-page", id: pages[3].id }],
      }),
    ).toEqual([{ type: "data-app-page", id: pages[3].id }]);
  });

  it("should select a parent page when hidden page is open", () => {
    expect(
      getSelectedItems({
        dataApp,
        pages,
        selectedItems: [{ type: "data-app-page", id: pages[2].id }],
      }),
    ).toEqual([{ type: "data-app-page", id: pages[1].id }]);
  });
});
