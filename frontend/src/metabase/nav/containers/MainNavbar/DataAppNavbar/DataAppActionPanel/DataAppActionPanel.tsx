import React, { useMemo } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import EntityMenu from "metabase/components/EntityMenu";
import Tooltip from "metabase/components/Tooltip";

import * as Urls from "metabase/lib/urls";

import type { DataApp } from "metabase-types/api";

import NewButton from "../NewButton";
import { Root, ActionsContainer } from "./DataAppActionPanel.styled";

interface Props {
  dataApp: DataApp;
  hasEditPageAction?: boolean;
  hasArchivePageAction?: boolean;
  hasManageContentAction?: boolean;
  onAddData: () => void;
  onNewPage: () => void;
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
  hasEditPageAction = true,
  hasArchivePageAction = true,
  hasManageContentAction = true,
  onAddData,
  onNewPage,
  onEditAppPage,
  onEditAppSettings,
  onArchiveApp,
  onArchivePage,
}: Props) {
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

    if (hasArchivePageAction) {
      items.push({
        title: t`Archive this page`,
        icon: "archive",
        action: onArchivePage,
      });
    }

    items.push({
      title: t`Archive this app`,
      icon: "archive",
      action: onArchiveApp,
    });

    return items;
  }, [
    dataApp,
    hasArchivePageAction,
    hasManageContentAction,
    onEditAppSettings,
    onArchiveApp,
    onArchivePage,
  ]);

  return (
    <Root>
      <ActionsContainer>
        <NewButton onAddData={onAddData} onNewPage={onNewPage} />
      </ActionsContainer>
      <ActionsContainer>
        {hasEditPageAction && (
          <Tooltip tooltip={t`Edit page`}>
            <Button icon="pencil" onlyIcon onClick={onEditAppPage} />
          </Tooltip>
        )}
        <EntityMenu
          items={menuItems}
          triggerIcon="ellipsis"
          tooltip={t`Manage content, settings and more…`}
        />
      </ActionsContainer>
    </Root>
  );
}

export default DataAppActionPanel;
