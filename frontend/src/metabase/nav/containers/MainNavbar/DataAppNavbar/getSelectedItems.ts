import {
  getDataAppHomePageId,
  getParentDataAppPageId,
} from "metabase/entities/data-apps";

import type { DataApp, Dashboard } from "metabase-types/api";

import { SelectedItem } from "../types";

function isAtDataAppHomePage(selectedItems: SelectedItem[]) {
  const [selectedItem] = selectedItems;
  return selectedItems.length === 1 && selectedItem.type === "data-app";
}

function isDataAppPageSelected(selectedItems: SelectedItem[]) {
  const [selectedItem] = selectedItems;
  return selectedItems.length === 1 && selectedItem.type === "data-app-page";
}

type Opts = {
  dataApp: DataApp;
  pages: Dashboard[];
  selectedItems: SelectedItem[];
};

function getSelectedItems({
  dataApp,
  pages,
  selectedItems,
}: Opts): SelectedItem[] {
  const isHomepage = isAtDataAppHomePage(selectedItems);

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

  if (isDataAppPageSelected(selectedItems)) {
    const [selectedPage] = selectedItems;
    const navItem = dataApp.nav_items.find(
      item => item.page_id === selectedPage.id,
    );

    // If the selected page is hidden, there's nothing to highlight,
    // so we want to highlight the parent
    if (navItem?.hidden) {
      const parentPageId = getParentDataAppPageId(
        selectedPage.id as number,
        dataApp.nav_items,
      );
      return [
        {
          type: "data-app-page",
          id: parentPageId || getDataAppHomePageId(dataApp, pages),
        },
      ];
    }
  }

  return selectedItems;
}

export default getSelectedItems;
