import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import type { DataApp, DataAppPage, DataAppNavItem } from "metabase-types/api";

import { MainNavbarProps, SelectedItem } from "../types";
import {
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarSection,
} from "../MainNavbar.styled";
import DataAppActionPanel from "./DataAppActionPanel";

import DataAppPageSidebarLink from "./DataAppPageSidebarLink";

interface Props extends MainNavbarProps {
  dataApp: DataApp;
  pages: any[];
  selectedItems: SelectedItem[];
  onEditAppSettings: () => void;
  onAddData: () => void;
  onNewPage: () => void;
}

function DataAppNavbarView({
  dataApp,
  pages,
  selectedItems,
  onEditAppSettings,
  onAddData,
  onNewPage,
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

  const renderPage = useCallback(
    (page: DataAppPage, indent = 0) => (
      <DataAppPageSidebarLink
        key={page.id}
        dataApp={dataApp}
        page={page}
        isSelected={dataAppPage?.id === page.id}
        indent={indent}
      />
    ),
    [dataApp, dataAppPage],
  );

  const renderNavItem = useCallback(
    (navItem: DataAppNavItem) => {
      const page = pageMap[navItem.page_id];

      if (!page || navItem.hidden) {
        return null;
      }

      return renderPage(page, navItem.indent);
    },
    [pageMap, renderPage],
  );

  return (
    <SidebarContentRoot>
      <SidebarSection>
        <SidebarHeadingWrapper>
          <SidebarHeading>{dataApp.collection.name}</SidebarHeading>
        </SidebarHeadingWrapper>
        <ul>
          {dataApp.nav_items.map(renderNavItem)}
          {pagesWithoutNavItems.map(page => renderPage(page))}
        </ul>
      </SidebarSection>
      <DataAppActionPanel
        dataApp={dataApp}
        onAddData={onAddData}
        onNewPage={onNewPage}
        onEditAppSettings={onEditAppSettings}
      />
    </SidebarContentRoot>
  );
}

export default DataAppNavbarView;
