import React, { useMemo } from "react";
import { t } from "ttag";

import EntityMenu from "metabase/components/EntityMenu";

import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";

import { Root } from "./DataAppActionPanel.styled";

interface Props {
  dataApp: DataApp;
  onEditAppSettings: () => void;
}

function DataAppActionPanel({ dataApp, onEditAppSettings }: Props) {
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
      <EntityMenu items={menuItems} triggerIcon="ellipsis" />
    </Root>
  );
}

export default DataAppActionPanel;
