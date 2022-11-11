import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import type {
  DataApp,
  DataAppNavItem,
  DataAppPageId,
} from "metabase-types/api";

import type { MainNavbarProps, SelectedItem } from "../types";
import type { DataAppNavbarMode } from "./types";

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
  onArchiveApp: () => void;
  onArchivePage: () => void;
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
  onArchiveApp,
  onArchivePage,
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

  const hasSelectedPage = !!dataAppPage?.id;

  // Archiving last app page would lead a user into a weird app state
  // For now we'd just hide the action when there's only one top-level page left
  // and only let people archive the whole app instead
  const hasArchivePageAction = hasSelectedPage && navItems.length > 1;

  return (
    <Root>
      <NavItemsList>{navItems.map(renderNavItem)}</NavItemsList>
      <DataAppActionPanel
        dataApp={dataApp}
        hasEditPageAction={hasSelectedPage}
        hasManageContentAction={mode !== "manage-content"}
        hasArchivePageAction={hasArchivePageAction}
        onAddData={onAddData}
        onNewPage={onNewPage}
        onEditAppPage={onEditAppPage}
        onEditAppSettings={onEditAppSettings}
        onArchiveApp={onArchiveApp}
        onArchivePage={onArchivePage}
      />
    </Root>
  );
}

export default DataAppNavbarView;
