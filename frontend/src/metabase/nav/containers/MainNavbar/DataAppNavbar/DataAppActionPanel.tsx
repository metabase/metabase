import React from "react";
import _ from "underscore";
import { t } from "ttag";

import ButtonGroup from "metabase/core/components/ButtonGroup";
import Link from "metabase/core/components/Link";
import Tooltip from "metabase/components/Tooltip";

import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";

import {
  DataAppActionsContainer,
  DataAppActionButton,
  ExitDataAppButton,
} from "../MainNavbar.styled";

interface Props {
  dataApp: DataApp;
  onNewPage: () => void;
  onEditAppSettings: () => void;
}

function DataAppActionPanel({ dataApp, onNewPage, onEditAppSettings }: Props) {
  return (
    <DataAppActionsContainer>
      <ButtonGroup>
        <Tooltip tooltip={t`Add`}>
          <DataAppActionButton icon="add" onClick={onNewPage} onlyIcon />
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
  );
}

export default DataAppActionPanel;
