import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import type {
  DataApp,
  DataAppNavItem,
  DataAppPageId,
} from "metabase-types/api";

import type { MainNavbarProps, SelectedItem } from "../types";
import type { DataAppNavbarMode } from "./types";

import NewButton from "./NewButton";
import DataAppPageLink from "./DataAppPageLink";
import DataAppActionPanel from "./DataAppActionPanel";

import { Root, NavItemsList } from "./DataAppNavbarView.styled";

interface Props extends Omit<MainNavbarProps, "location" | "params"> {
  dataApp: DataApp;
  pages: any[];
  selectedItems: SelectedItem[];
  mode: DataAppNavbarMode;
  onEditAppPage: () => void;
  onEditAppSettings: () => void;
  onAddData: () => void;
  onNewPage: () => void;
  onAppArchived: () => void;
  onPageArchived: (pageId: DataAppPageId) => void;
}

function DataAppNavbarView({
  dataApp,
  pages,
  selectedItems,
  mode,
  onEditAppPage,
  onEditAppSettings,
  onAddData,
  onNewPage,
  onAppArchived,
  onPageArchived,
}: Props) {
  const { "data-app-page": dataAppPage } = _.indexBy(
    selectedItems,
    item => item.type,
  );

  const pageMap = useMemo(() => _.indexBy(pages, "id"), [pages]);

  const pagesWithoutNavItems = useMemo(() => {
    const pageIds = pages.map(page => page.id);
    const navItemPageIds = dataApp.nav_items
      .filter(navItem => navItem.page_id)
      .map(navItem => navItem.page_id);
    const pagesWithoutNavItems = _.difference(pageIds, navItemPageIds);
    return pagesWithoutNavItems.map(pageId => pageMap[pageId]);
  }, [dataApp.nav_items, pages, pageMap]);

  const navItems = useMemo(() => {
    const items = dataApp.nav_items.filter(
      navItem => !navItem.hidden && pageMap[navItem.page_id],
    );

    items.push(...pagesWithoutNavItems.map(page => ({ page_id: page.id })));

    return items;
  }, [dataApp, pagesWithoutNavItems, pageMap]);

  const renderNavItem = useCallback(
    (navItem: DataAppNavItem) => (
      <li key={navItem.page_id}>
        <DataAppPageLink
          dataApp={dataApp}
          page={pageMap[navItem.page_id]}
          isSelected={dataAppPage?.id === navItem.page_id}
        />
      </li>
    ),
    [dataApp, pageMap, dataAppPage],
  );

  return (
    <Root>
      <NavItemsList>
        {navItems.map(renderNavItem)}
        <li>
          <NewButton onAddData={onAddData} onNewPage={onNewPage} />
        </li>
      </NavItemsList>
      <DataAppActionPanel
        dataApp={dataApp}
        selectedPageId={dataAppPage?.id as DataAppPageId}
        archiveActionTarget={navItems.length > 1 ? "page" : "app"}
        hasManageContentAction={mode !== "manage-content"}
        onEditAppPage={onEditAppPage}
        onEditAppSettings={onEditAppSettings}
        onAppArchived={onAppArchived}
        onPageArchived={onPageArchived}
      />
    </Root>
  );
}

export default DataAppNavbarView;
