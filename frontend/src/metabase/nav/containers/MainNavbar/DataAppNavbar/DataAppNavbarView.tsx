import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import type { DataApp, DataAppNavItem } from "metabase-types/api";

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

  const renderNavItem = useCallback(
    (navItem: DataAppNavItem) => {
      const page = pageMap[navItem.page_id];

      if (!page || navItem.hidden) {
        return null;
      }

      return (
        <DataAppPageSidebarLink
          key={page.id}
          dataApp={dataApp}
          page={page}
          isSelected={dataAppPage?.id === page.id}
          indent={navItem.indent}
        />
      );
    },
    [dataApp, pageMap, dataAppPage],
  );

  return (
    <SidebarContentRoot>
      <SidebarSection>
        <SidebarHeadingWrapper>
          <SidebarHeading>{dataApp.collection.name}</SidebarHeading>
        </SidebarHeadingWrapper>
        <ul>{dataApp.nav_items.map(renderNavItem)}</ul>
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
