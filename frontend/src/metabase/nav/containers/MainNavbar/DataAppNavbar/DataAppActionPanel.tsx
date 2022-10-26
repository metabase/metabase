import React, { useMemo } from "react";
import _ from "underscore";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/components/Tooltip";

import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";

import {
  ActionGroup,
  DataAppActionsContainer,
  DataAppActionButton,
  ExitDataAppButton,
} from "../MainNavbar.styled";

interface Props {
  dataApp: DataApp;
  onAddData: () => void;
  onNewPage: () => void;
  onEditAppSettings: () => void;
}

function DataAppActionPanel({
  dataApp,
  onAddData,
  onNewPage,
  onEditAppSettings,
}: Props) {
  const addMenuItems = useMemo(
    () => [
      {
        title: t`Data`,
        icon: "database",
        action: onAddData,
      },
      {
        title: t`Page`,
        icon: "pencil",
        action: onNewPage,
      },
    ],
    [onAddData, onNewPage],
  );

  return (
    <DataAppActionsContainer>
      <ActionGroup>
        <ActionGroup.Cell>
          <EntityMenu
            items={addMenuItems}
            trigger={
              <Tooltip tooltip={t`Add`}>
                <DataAppActionButton icon="add" />
              </Tooltip>
            }
          />
        </ActionGroup.Cell>
        <ActionGroup.Cell>
          <Tooltip tooltip={t`Settings`}>
            <DataAppActionButton icon="gear" onClick={onEditAppSettings} />
          </Tooltip>
        </ActionGroup.Cell>
      </ActionGroup>
      <ExitDataAppButton
        as={Link}
        to={Urls.dataApp(dataApp, { mode: "preview" })}
      >{t`Exit app`}</ExitDataAppButton>
    </DataAppActionsContainer>
  );
}

export default DataAppActionPanel;
