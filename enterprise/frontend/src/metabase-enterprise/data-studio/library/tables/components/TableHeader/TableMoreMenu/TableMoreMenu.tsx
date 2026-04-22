import { useState } from "react";
import { push } from "react-router-redux";
import { c, t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { CollectionPickerModal } from "metabase/common/components/Pickers";
import { PLUGIN_LIBRARY, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useDispatch, useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type { Table } from "metabase-types/api";

type TableModalType = "unpublish" | "move";

type TableMoreMenuProps = {
  table: Table;
};

export function TableMoreMenu({ table }: TableMoreMenuProps) {
  const dispatch = useDispatch();
  const [modalType, setModalType] = useState<TableModalType>();
  const [updateTable] = useUpdateTableMutation();
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const handleUnpublish = () => {
    setModalType(undefined);
    dispatch(push(Urls.dataStudioLibrary()));
  };

  const handleMove = async (newCollection: { id: number | string }) => {
    await updateTable({
      id: table.id,
      collection_id: newCollection.id as number,
    }).unwrap();
    setModalType(undefined);
  };

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm" aria-label={t`Show table options`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="external" />}
            component={ForwardRefLink}
            to={Urls.queryBuilderTable(table.id, table.db_id)}
            target="_blank"
          >
            {c("A verb, not a noun").t`View`}
          </Menu.Item>
          {!remoteSyncReadOnly && (
            <>
              <Menu.Item
                leftSection={<Icon name="move" />}
                onClick={() => setModalType("move")}
              >
                {t`Move`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="unpublish" />}
                onClick={() => setModalType("unpublish")}
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
        />
      )}
    </>
  );
}
