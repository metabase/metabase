import { useState } from "react";
import { push } from "react-router-redux";
import { c, t } from "ttag";

import { collectionApi, useUpdateTableMutation } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { CollectionPickerModal } from "metabase/common/components/Pickers";
import { PLUGIN_LIBRARY, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { ActionIcon, Box, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CollectionId, CollectionItem, Table } from "metabase-types/api";

type TableModalType = "unpublish" | "move";

export type TableMoreMenuProps = {
  table:
    | Pick<CollectionItem, "id" | "database_id" | "collection_id">
    | Pick<Table, "id" | "db_id" | "collection_id">;
  onMoved?: (collectionIds: CollectionId[]) => void;
};

export function TableMoreMenu({ table, onMoved }: TableMoreMenuProps) {
  const dispatch = useDispatch();
  const [modalType, setModalType] = useState<TableModalType>();
  const [updateTable] = useUpdateTableMutation();
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const dbId = "db_id" in table ? table.db_id : table.database_id;

  const handleUnpublish = () => {
    setModalType(undefined);
    dispatch(push(Urls.dataStudioLibrary()));
  };

  const handleMove = async (newCollection: { id: CollectionId }) => {
    const sourceCollectionId = table.collection_id;
    await updateTable({
      id: table.id,
      collection_id: newCollection.id,
    }).unwrap();
    dispatch(
      collectionApi.util.invalidateTags([
        { type: "collection", id: `${sourceCollectionId}-items` },
        { type: "collection", id: `${newCollection.id}-items` },
      ]),
    );
    const affectedIds: CollectionId[] = [newCollection.id];
    if (sourceCollectionId != null) {
      affectedIds.push(sourceCollectionId);
    }
    onMoved?.(affectedIds);
    setModalType(undefined);
  };

  return (
    <Box
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <Menu withinPortal>
        <Menu.Target>
          <ActionIcon
            aria-label={t`Show table options`}
            size="md"
            onClick={(event) => {
              event.preventDefault();
            }}
          >
            <FixedSizeIcon name="ellipsis" size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {dbId != null && (
            <Menu.Item
              leftSection={<Icon name="external" />}
              component={ForwardRefLink}
              to={Urls.queryBuilderTable(table.id, dbId)}
              target="_blank"
            >
              {c("A verb, not a noun").t`View`}
            </Menu.Item>
          )}
          {!remoteSyncReadOnly && (
            <>
              <Menu.Item
                leftSection={<Icon name="move" />}
                onClick={(event) => {
                  setModalType("move");
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {t`Move`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="unpublish" />}
                onClick={(event) => {
                  setModalType("unpublish");
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {t`Unpublish`}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      <PLUGIN_LIBRARY.UnpublishTablesModal
        isOpened={modalType === "unpublish"}
        tableIds={[table.id]}
        onUnpublish={handleUnpublish}
        onClose={() => setModalType(undefined)}
      />
      {modalType === "move" && (
        <CollectionPickerModal
          title={t`Move table to…`}
          value={{
            id: table.collection_id ?? "root",
            model: "collection",
          }}
          onChange={handleMove}
          onClose={() => setModalType(undefined)}
          options={{
            hasLibrary: true,
            hasRootCollection: false,
            hasPersonalCollections: false,
            hasSearch: true,
            hasRecents: false,
            hasConfirmButtons: true,
            confirmButtonText: t`Move`,
          }}
          entityType="table"
        />
      )}
    </Box>
  );
}
