import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackDependencyEntitySelected } from "metabase/common/data-studio/analytics";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_LIBRARY,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_REPLACEMENT,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import { dependencyGraph } from "metabase/urls/dependencies";
import type { Table } from "metabase-types/api";

import { useTableSyncActions } from "./use-table-sync-actions";

interface Props {
  table: Table;
  canPublish: boolean;
  hasLibrary: boolean;
  onUpdate: () => void;
}

type TableModalType = "library" | "publish" | "unpublish" | "replace";

/** Overflow menu holding every action for a single table in the drawer header. */
export function TableActionsMenu({
  table,
  canPublish,
  hasLibrary,
  onUpdate,
}: Props) {
  const [modalType, setModalType] = useState<TableModalType>();
  const {
    syncSchema: handleSyncSchema,
    rescanFieldValues: handleRescan,
    discardFieldValues: handleDiscard,
  } = useTableSyncActions(table);
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const tableIds = [table.id];
  const showPublishItem =
    canPublish && PLUGIN_LIBRARY.isEnabled && !remoteSyncReadOnly;
  const showSyncItems = !table.db?.is_attached_dwh;
  const tableUrl =
    Urls.modelToUrl({
      id: Number(table.id),
      name: table.name,
      model: "table",
      database: { id: table.db_id },
    }) ?? "#";
  const schemaViewerUrl = Urls.dataStudioSchemaViewer({
    databaseId: table.db_id,
    schema: table.schema,
    tableIds,
  });

  const handlePublishToggle = () => {
    if (!hasLibrary) {
      setModalType("library");
    } else {
      setModalType(table.is_published ? "unpublish" : "publish");
    }
  };

  const handleCloseModal = () => {
    setModalType(undefined);
  };

  const handleSuccessCloseModal = () => {
    onUpdate();
    handleCloseModal();
  };

  const trackDependencyGraphOpened = () => {
    if (typeof table.id === "number") {
      trackDependencyEntitySelected({
        entityId: table.id,
        triggeredFrom: "data-structure",
        eventDetail: "table",
      });
    }
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon aria-label={t`More actions`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {showPublishItem && (
            <Menu.Item
              leftSection={
                <Icon name={table.is_published ? "unpublish" : "publish"} />
              }
              onClick={handlePublishToggle}
            >
              {table.is_published ? t`Unpublish` : t`Publish`}
            </Menu.Item>
          )}
          <Menu.Item
            component={ForwardRefLink}
            to={tableUrl}
            leftSection={<Icon name="external" />}
          >
            {t`Go to this table`}
          </Menu.Item>
          {PLUGIN_DEPENDENCIES.isEnabled && (
            <Menu.Item
              component={ForwardRefLink}
              to={dependencyGraph({
                entry: { id: Number(table.id), type: "table" },
              })}
              leftSection={<Icon name="dependencies" />}
              onClickCapture={trackDependencyGraphOpened}
              onAuxClick={trackDependencyGraphOpened}
            >
              {t`Dependency graph`}
            </Menu.Item>
          )}
          <Menu.Item
            component={ForwardRefLink}
            to={schemaViewerUrl}
            leftSection={<Icon name="network" />}
          >
            {t`View schema`}
          </Menu.Item>

          {showSyncItems && (
            <>
              <Menu.Divider />
              <Menu.Item
                leftSection={<Icon name="sync" />}
                onClick={handleSyncSchema}
              >
                {t`Re-sync schema`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="list" />}
                onClick={handleRescan}
              >
                {t`Re-scan field values`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="trash" />}
                onClick={handleDiscard}
              >
                {t`Discard cached field values`}
              </Menu.Item>
            </>
          )}
          <PLUGIN_REPLACEMENT.SourceReplacementButton>
            {({ isDisabled }) => (
              <Menu.Item
                leftSection={<Icon name="find_replace" />}
                disabled={isDisabled}
                onClick={() => setModalType("replace")}
              >
                {t`Find and replace`}
              </Menu.Item>
            )}
          </PLUGIN_REPLACEMENT.SourceReplacementButton>
        </Menu.Dropdown>
      </Menu>

      <PLUGIN_LIBRARY.CreateLibraryModal
        title={t`First, let's create your semantic layer`}
        explanatorySentence={t`This is where published tables will go.`}
        isOpened={modalType === "library"}
        onCreate={() => setModalType("publish")}
        onClose={handleCloseModal}
      />
      <PLUGIN_LIBRARY.PublishTablesModal
        isOpened={modalType === "publish"}
        tableIds={tableIds}
        onPublish={handleSuccessCloseModal}
        onClose={handleCloseModal}
      />
      <PLUGIN_LIBRARY.UnpublishTablesModal
        isOpened={modalType === "unpublish"}
        tableIds={tableIds}
        onUnpublish={handleSuccessCloseModal}
        onClose={handleCloseModal}
      />
      <PLUGIN_REPLACEMENT.SourceReplacementModal
        opened={modalType === "replace"}
        initialSource={{ id: Number(table.id), type: "table" }}
        triggeredFrom="table_list"
        onClose={handleCloseModal}
      />
    </>
  );
}
