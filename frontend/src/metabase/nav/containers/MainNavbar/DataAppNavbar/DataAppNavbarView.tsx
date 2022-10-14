import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import type { DataApp, DataAppPage, DataAppNavItem } from "metabase-types/api";

import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import * as Urls from "metabase/lib/urls";

import { MainNavbarProps, SelectedItem } from "../types";
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
    <div className="flex align-center">
      <ul className="flex align-center">
        {dataApp.nav_items.map(renderNavItem)}
        {pagesWithoutNavItems.map(page => renderPage(page))}
      </ul>
      <div className="flex align-center ml-auto">
        <DataAppActionPanel
          dataApp={dataApp}
          onAddData={onAddData}
          onNewPage={onNewPage}
          onEditAppSettings={onEditAppSettings}
        />
        <Tooltip tooltip={`App elements`}>
          <Link to={Urls.dataApp(dataApp, { mode: "preview" })} className="ml2">
            <Icon name="list" />
          </Link>
        </Tooltip>
      </div>
    </div>
  );
}

export default DataAppNavbarView;
