import React, { useMemo } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import EntityMenu from "metabase/components/EntityMenu";
import Tooltip from "metabase/components/Tooltip";

import * as Urls from "metabase/lib/urls";

import type { DataApp, DataAppPage } from "metabase-types/api";

import { Root } from "./DataAppActionPanel.styled";

interface Props {
  dataApp: DataApp;
  selectedPageId?: DataAppPage["id"];
  hasManageContentAction?: boolean;
  onEditAppPage: () => void;
  onEditAppSettings: () => void;
}

type MenuItem = {
  title: string;
  icon: string;
  link?: string;
  action?: () => void;
};

function DataAppActionPanel({
  dataApp,
  selectedPageId,
  hasManageContentAction = true,
  onEditAppPage,
  onEditAppSettings,
}: Props) {
  const hasSelectedPage = typeof selectedPageId === "number";

  const menuItems = useMemo(() => {
    const items: MenuItem[] = [
      {
        title: t`App settings`,
        icon: "gear",
        action: onEditAppSettings,
      },
    ];

    if (hasManageContentAction) {
      items.push({
        title: t`Manage content`,
        icon: "list",
        link: Urls.dataApp(dataApp, { mode: "preview" }),
      });
    }

    return items;
  }, [dataApp, hasManageContentAction, onEditAppSettings]);

  return (
    <Root>
      {hasSelectedPage && (
        <Tooltip tooltip={t`Edit page`}>
          <Button icon="pencil" onlyIcon onClick={onEditAppPage} />
        </Tooltip>
      )}
      <EntityMenu
        items={menuItems}
        triggerIcon="ellipsis"
        tooltip={t`Manage content, settings and more…`}
      />
    </Root>
  );
}

export default DataAppActionPanel;
