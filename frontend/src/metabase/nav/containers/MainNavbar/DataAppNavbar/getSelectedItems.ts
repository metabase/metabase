import type { Location } from "history";

import * as Urls from "metabase/lib/urls";

import {
  getDataAppHomePageId,
  getParentDataAppPageId,
} from "metabase/entities/data-apps";

import type { DataApp, Dashboard } from "metabase-types/api";

import { SelectedItem } from "../types";

type Opts = {
  dataApp: DataApp;
  pages: Dashboard[];
  location: Location;
  params: {
    slug?: string;
    pageId?: string;
  };
};

function getSelectedItems({
  location,
  params,
  dataApp,
  pages,
}: Opts): SelectedItem[] {
  const isHomepage = Urls.isDataAppHomepagePath(location.pathname);

  // Once a data app is launched, the first view is going to be the app homepage
  // Homepage is an app page specified by a user or picked automatically (just the first one)
  // The homepage doesn't have a regular page path like /a/1/page/1, but an app one like /a/1
  // So we need to overwrite the selectedItems list here and specify the homepage
  if (isHomepage) {
    return [
      {
        type: "data-app-page",
        id: getDataAppHomePageId(dataApp, pages),
      },
    ];
  }

  if (Urls.isDataAppPagePath(location.pathname)) {
    const selectedPageId = Number(params.pageId);

    const navItem = dataApp.nav_items.find(
      item => item.page_id === selectedPageId,
    );

    // If the selected page is hidden, there's nothing to highlight,
    // so we want to highlight the parent
    if (navItem?.hidden) {
      const parentPageId = getParentDataAppPageId(
        selectedPageId,
        dataApp.nav_items,
      );
      return [
        {
          type: "data-app-page",
          id: parentPageId || getDataAppHomePageId(dataApp, pages),
        },
      ];
    }

    return [
      {
        type: "data-app-page",
        id: selectedPageId,
      },
    ];
  }

  return [];
}

export default getSelectedItems;
