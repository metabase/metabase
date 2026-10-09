import { c, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { ActionIcon, Box, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

import type { TableModalState, TableModalTable } from "../../TableModal";

export type TableMoreMenuProps = {
  table: TableModalTable;
  onOpenModal: (modal: TableModalState) => void;
  onMoved?: (collectionIds: CollectionId[]) => void;
};

export function TableMoreMenu({
  table,
  onOpenModal,
  onMoved,
}: TableMoreMenuProps) {
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const dbId = "db_id" in table ? table.db_id : table.database_id;

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
                  onOpenModal({ type: "move", table, onMoved });
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {t`Move`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="unpublish" />}
                onClick={(event) => {
                  onOpenModal({ type: "unpublish", table });
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
    </Box>
  );
}
