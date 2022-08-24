import React, { useMemo } from "react";

import * as Urls from "metabase/lib/urls";

import { DataApp } from "metabase-types/api";

import { MainNavbarProps } from "./types";
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
}

function DataAppNavbarView({ dataApp, items }: Props) {
  const appPages = useMemo(
    () => items.filter(item => item.model === "dashboard"),
    [items],
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
            isSelected={false}
          >
            {page.name}
          </DataAppLink>
        ))}
      </SidebarSection>
    </SidebarContentRoot>
  );
}

export default DataAppNavbarView;
