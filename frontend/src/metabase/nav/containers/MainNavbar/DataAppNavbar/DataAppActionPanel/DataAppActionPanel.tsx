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
  archiveActionTarget: "app" | "page";
  hasManageContentAction?: boolean;
  onEditAppPage: () => void;
  onEditAppSettings: () => void;
  onArchiveApp: () => void;
  onArchivePage: () => void;
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
  archiveActionTarget,
  hasManageContentAction = true,
  onEditAppPage,
  onEditAppSettings,
  onArchiveApp,
  onArchivePage,
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

    if (hasSelectedPage) {
      const isArchiveApp = archiveActionTarget === "app";
      items.push({
        title: isArchiveApp ? t`Archive this app` : t`Archive this page`,
        icon: "archive",
        action: isArchiveApp ? onArchiveApp : onArchivePage,
      });
    }

    return items;
  }, [
    dataApp,
    archiveActionTarget,
    hasSelectedPage,
    hasManageContentAction,
    onEditAppSettings,
    onArchiveApp,
    onArchivePage,
  ]);

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
