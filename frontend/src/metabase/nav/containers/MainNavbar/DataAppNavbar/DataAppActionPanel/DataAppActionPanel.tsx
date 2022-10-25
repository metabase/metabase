import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import EntityMenu from "metabase/components/EntityMenu";
import Modal from "metabase/components/Modal";
import Tooltip from "metabase/components/Tooltip";

import * as Urls from "metabase/lib/urls";

import ArchiveDataAppModal from "metabase/writeback/containers/ArchiveDataAppModal";
import ArchiveDataAppPageModal from "metabase/writeback/containers/ArchiveDataAppPageModal";

import type { DataApp, DataAppPage } from "metabase-types/api";

import { Root } from "./DataAppActionPanel.styled";

interface Props {
  dataApp: DataApp;
  selectedPageId?: DataAppPage["id"];
  archiveActionTarget: "app" | "page";
  hasManageContentAction?: boolean;
  onEditAppPage: () => void;
  onEditAppSettings: () => void;
  onAppArchived: () => void;
  onPageArchived: (pageId: DataAppPage["id"]) => void;
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
  onAppArchived,
  onPageArchived,
}: Props) {
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

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
      items.push({
        title:
          archiveActionTarget === "app"
            ? t`Archive this app`
            : t`Archive this page`,
        icon: "archive",
        action: () => setIsArchiveModalOpen(true),
      });
    }

    return items;
  }, [
    dataApp,
    archiveActionTarget,
    hasSelectedPage,
    hasManageContentAction,
    onEditAppSettings,
  ]);

  const handleCloseArchiveModal = useCallback(() => {
    setIsArchiveModalOpen(false);
  }, []);

  const handleArchive = useCallback(() => {
    if (selectedPageId) {
      onPageArchived(selectedPageId);
    }
  }, [selectedPageId, onPageArchived]);

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
      {hasSelectedPage && isArchiveModalOpen && (
        <Modal onClose={handleCloseArchiveModal}>
          {archiveActionTarget === "app" ? (
            <ArchiveDataAppModal
              appId={dataApp.id}
              onArchive={onAppArchived}
              onClose={handleCloseArchiveModal}
            />
          ) : (
            <ArchiveDataAppPageModal
              appId={dataApp.id}
              pageId={selectedPageId}
              onArchive={handleArchive}
              onClose={handleCloseArchiveModal}
            />
          )}
        </Modal>
      )}
    </Root>
  );
}

export default DataAppActionPanel;
