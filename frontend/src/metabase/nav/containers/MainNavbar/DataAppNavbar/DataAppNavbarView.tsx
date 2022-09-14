import React from "react";
import _ from "underscore";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";

import { MainNavbarProps, SelectedItem } from "../types";
import {
  DataAppNewButton,
  PaddedSidebarLink,
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarSection,
} from "../MainNavbar.styled";
import DataAppActionPanel from "./DataAppActionPanel";

interface Props extends MainNavbarProps {
  dataApp: DataApp;
  pages: any[];
  selectedItems: SelectedItem[];
  onEditAppSettings: () => void;
  onNewPage: () => void;
}

function DataAppNavbarView({
  dataApp,
  pages,
  selectedItems,
  onEditAppSettings,
  onNewPage,
}: Props) {
  const { "data-app-page": dataAppPage } = _.indexBy(
    selectedItems,
    item => item.type,
  );

  return (
    <SidebarContentRoot>
      <div>
        <SidebarSection>
          <SidebarHeadingWrapper>
            <SidebarHeading>{dataApp.collection.name}</SidebarHeading>
          </SidebarHeadingWrapper>
          <ul>
            {pages.map(page => (
              <PaddedSidebarLink
                key={page.id}
                url={Urls.dataAppPage(dataApp, page)}
                isSelected={dataAppPage?.id === page.id}
              >
                {page.name}
              </PaddedSidebarLink>
            ))}
          </ul>
        </SidebarSection>
        <div>
          <DataAppNewButton
            icon="add"
            onClick={onNewPage}
          >{t`Add new page`}</DataAppNewButton>
        </div>
      </div>
      <DataAppActionPanel
        dataApp={dataApp}
        onEditAppSettings={onEditAppSettings}
      />
    </SidebarContentRoot>
  );
}

export default DataAppNavbarView;
