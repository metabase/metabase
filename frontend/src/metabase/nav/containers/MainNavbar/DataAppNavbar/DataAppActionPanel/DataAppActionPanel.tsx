import React, { useMemo } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import EntityMenu from "metabase/components/EntityMenu";
import Tooltip from "metabase/components/Tooltip";

import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";

import { Root } from "./DataAppActionPanel.styled";

interface Props {
  dataApp: DataApp;
  onEditAppPage: () => void;
  onEditAppSettings: () => void;
}

function DataAppActionPanel({
  dataApp,
  onEditAppPage,
  onEditAppSettings,
}: Props) {
  const menuItems = useMemo(
    () => [
      {
        title: t`Manage content`,
        icon: "list",
        link: Urls.dataApp(dataApp, { mode: "preview" }),
      },
      {
        title: t`App settings`,
        icon: "gear",
        action: onEditAppSettings,
      },
    ],
    [dataApp, onEditAppSettings],
  );

  return (
    <Root>
      <Tooltip tooltip={t`Edit page`}>
        <Button icon="pencil" onlyIcon onClick={onEditAppPage} />
      </Tooltip>
      <EntityMenu
        items={menuItems}
        triggerIcon="ellipsis"
        tooltip={t`Manage content, settings and more…`}
      />
    </Root>
  );
}

export default DataAppActionPanel;
