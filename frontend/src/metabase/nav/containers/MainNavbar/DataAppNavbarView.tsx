import React, { useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";

import ButtonGroup from "metabase/core/components/ButtonGroup";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/components/Tooltip";

import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";

import { MainNavbarProps, SelectedItem } from "./types";
import {
  DataAppActionsContainer,
  DataAppActionButton,
  ExitDataAppButton,
  PaddedSidebarLink,
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarSection,
} from "./MainNavbar.styled";

interface Props extends MainNavbarProps {
  dataApp: DataApp;
  items: any[];
  selectedItems: SelectedItem[];
  onEditAppSettings: () => void;
}

function DataAppNavbarView({
  dataApp,
  items,
  selectedItems,
  onEditAppSettings,
}: Props) {
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
        <ul>
          {appPages.map(page => (
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
      <DataAppActionsContainer>
        <ButtonGroup>
          <Tooltip tooltip={t`Add`}>
            <DataAppActionButton icon="add" onlyIcon />
          </Tooltip>
          <Tooltip tooltip={t`Settings`}>
            <DataAppActionButton
              icon="gear"
              onClick={onEditAppSettings}
              onlyIcon
            />
          </Tooltip>
        </ButtonGroup>
        <ExitDataAppButton
          as={Link}
          to={Urls.dataApp(dataApp, { mode: "preview" })}
        >{t`Exit app`}</ExitDataAppButton>
      </DataAppActionsContainer>
    </SidebarContentRoot>
  );
}

export default DataAppNavbarView;
