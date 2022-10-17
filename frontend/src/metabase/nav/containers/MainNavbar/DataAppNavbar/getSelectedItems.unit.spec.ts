import type { Location } from "history";

import * as Urls from "metabase/lib/urls";

import {
  createMockDataApp,
  createMockDataAppPage,
} from "metabase-types/api/mocks";
import getSelectedItems from "./getSelectedItems";

function getMockLocation(pathname: string): Location {
  return { pathname } as Location;
}

describe("getSelectedItems", () => {
  const homepage = createMockDataAppPage({ id: 2 });

  const dataApp = createMockDataApp({
    dashboard_id: homepage.id,
    nav_items: [
      { page_id: 1 },
      { page_id: 2 },
      { page_id: 3, indent: 1, hidden: true },
      { page_id: 4, indent: 1 },
    ],
  });

  const pages = [
    createMockDataAppPage({ id: 1 }),
    homepage,
    createMockDataAppPage({ id: 3 }),
    createMockDataAppPage({ id: 4 }),
  ];

  it("should select the homepage when no page is selected explicitly", () => {
    const location = getMockLocation(
      Urls.dataApp(dataApp, { mode: "internal" }),
    );

    expect(
      getSelectedItems({
        dataApp,
        pages,
        location,
        params: { slug: String(dataApp.id) },
      }),
    ).toEqual([{ type: "data-app-page", id: dataApp.dashboard_id }]);
  });

  it("should select the homepage when it's explicitly selected", () => {
    const location = getMockLocation(Urls.dataAppPage(dataApp, homepage));

    expect(
      getSelectedItems({
        dataApp,
        pages,
        location,
        params: {
          slug: String(dataApp.id),
          pageId: String(dataApp.dashboard_id),
        },
      }),
    ).toEqual([{ type: "data-app-page", id: dataApp.dashboard_id }]);
  });

  it("should select the first page when no page is selected explicitly and homepage is not set", () => {
    const location = getMockLocation(
      Urls.dataApp(dataApp, { mode: "internal" }),
    );

    expect(
      getSelectedItems({
        dataApp: { ...dataApp, dashboard_id: null },
        pages,
        location,
        params: { slug: String(dataApp.id) },
      }),
    ).toEqual([{ type: "data-app-page", id: pages[0].id }]);
  });

  it("should select a regular top-level page", () => {
    const [page] = pages;
    const location = getMockLocation(Urls.dataAppPage(dataApp, page));

    expect(
      getSelectedItems({
        dataApp,
        pages,
        location,
        params: { slug: String(dataApp.id), pageId: String(page.id) },
      }),
    ).toEqual([{ type: "data-app-page", id: page.id }]);
  });

  it("should select a regular nested page", () => {
    const page = pages[3];
    const location = getMockLocation(Urls.dataAppPage(dataApp, page));

    expect(
      getSelectedItems({
        dataApp,
        pages,
        location,
        params: { slug: String(dataApp.id), pageId: String(page.id) },
      }),
    ).toEqual([{ type: "data-app-page", id: page.id }]);
  });

  it("should select a parent page when hidden page is open", () => {
    const page = pages[2];
    const parentPage = pages[1];
    const location = getMockLocation(Urls.dataAppPage(dataApp, page));

    expect(
      getSelectedItems({
        dataApp,
        pages,
        location,
        params: { slug: String(dataApp.id), pageId: String(page.id) },
      }),
    ).toEqual([{ type: "data-app-page", id: parentPage.id }]);
  });
});
