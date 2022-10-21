import React from "react";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";

import {
  ActionGroup,
  DataAppActionsContainer,
  DataAppActionButton,
} from "../MainNavbar.styled";

interface Props {
  onEditAppSettings: () => void;
}

function DataAppActionPanel({ onEditAppSettings }: Props) {
  return (
    <DataAppActionsContainer>
      <ActionGroup>
        <ActionGroup.Cell>
          <Tooltip tooltip={t`Settings`}>
            <DataAppActionButton icon="gear" onClick={onEditAppSettings} />
          </Tooltip>
        </ActionGroup.Cell>
      </ActionGroup>
    </DataAppActionsContainer>
  );
}

export default DataAppActionPanel;
