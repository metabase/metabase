import React, { useMemo } from "react";
import _ from "underscore";

import * as Urls from "metabase/lib/urls";

import { DataApp } from "metabase-types/api";

import { MainNavbarProps, SelectedItem } from "./types";
import {
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarSection,
  DataAppLink,
} from "./MainNavbar.styled";

interface Props extends MainNavbarProps {
  dataApp: DataApp;
  items: any[];
  selectedItems: SelectedItem[];
}

function DataAppNavbarView({ dataApp, items, selectedItems }: Props) {
  const appPages = useMemo(
    () => items.filter(item => item.model === "dashboard"),
    [items],
  );

  const { "data-app-page": dataAppPage } = _.indexBy(
    selectedItems,
    item => item.type,
  );

  return (
    <SidebarContentRoot>
      <SidebarSection>
        <SidebarHeadingWrapper>
          <SidebarHeading>{dataApp.collection.name}</SidebarHeading>
        </SidebarHeadingWrapper>
        {appPages.map(page => (
          <DataAppLink
            key={page.id}
            url={Urls.dataAppPage(dataApp, page)}
            isSelected={dataAppPage?.id === page.id}
          >
            {page.name}
          </DataAppLink>
        ))}
      </SidebarSection>
    </SidebarContentRoot>
  );
}

export default DataAppNavbarView;
