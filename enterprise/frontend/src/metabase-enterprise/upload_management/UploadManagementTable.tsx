import { useCallback, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import SettingHeader from "metabase/admin/settings/components/SettingHeader";
import {
  BulkActionsPopover,
  BulkActionButton,
} from "metabase/common/components/BulkActions";
import { StyledTable } from "metabase/common/components/Table";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import { Box, Flex, Text, Button, Icon, Checkbox } from "metabase/ui";
import {
  useListUploadTablesQuery,
  useDeleteUploadTableMutation,
} from "metabase-enterprise/api";
import type { Table } from "metabase-types/api";

import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { getDateDisplay } from "./utils";

const columns = [
  { key: "checkbox", name: "" },
  { key: "display_name", name: t`Table name` },
  { key: "created_at", name: t`Created at` },
  { key: "schema", name: t`Schema` },
  { key: "actions", name: "" },
];

export function UploadManagementTable() {
  const [selectedItems, setSelectedItems] = useState<Table[]>([]);
  const [deleteTableRequest] = useDeleteUploadTableMutation();
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  const { data: uploadTables, error, isLoading } = useListUploadTablesQuery();

  const deleteTable = useCallback(
    async (table: Table) => {
      await deleteTableRequest({ tableId: table.id });
    },
    [deleteTableRequest],
  );

  const renderRow = useCallback(
    (row: Table) => (
      <UploadTableRow
        item={row}
        isSelected={selectedItems.some(
          selectedTable => selectedTable.id === row.id,
        )}
        onSelect={newItem =>
          setSelectedItems(prevItems => [...prevItems, newItem])
        }
        onDeselect={newItem =>
          setSelectedItems(prevItems =>
            prevItems.filter(i => i.id !== newItem.id),
          )
        }
        onTrash={item => {
          setSelectedItems([item]);
          setShowDeleteConfirmModal(true);
        }}
      />
    ),
    [selectedItems],
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!uploadTables?.length) {
    return null;
  }

  return (
    <Box p="md" mt="lg">
      <DeleteConfirmModal
        opened={showDeleteConfirmModal}
        tables={selectedItems}
        onConfirm={async () => {
          await Promise.all(selectedItems.map(deleteTable));
          setShowDeleteConfirmModal(false);
          setSelectedItems([]);
        }}
        onClose={() => setShowDeleteConfirmModal(false)}
      />
      {selectedItems.length > 0 && (
        <BulkActionsPopover
          opened={selectedItems.length > 0}
          message={ngettext(
            msgid`Selected ${selectedItems.length} table`,
            `Selected ${selectedItems.length} tables`,
            selectedItems.length,
          )}
        >
          <BulkActionButton onClick={() => setShowDeleteConfirmModal(true)}>
            {t`Delete`}
          </BulkActionButton>
        </BulkActionsPopover>
      )}
      <SettingHeader
        id="upload-tables-list"
        setting={{
          display_name: t`Manage Uploads`,
        }}
      />
      <Text fw="bold" color="text-medium">
        {t`Uploaded Tables`}
      </Text>
      <StyledTable
        columns={columns}
        rows={uploadTables}
        rowRenderer={row => renderRow(row as Table)}
      />
    </Box>
  );
}

const UploadTableRow = ({
  item,
  onSelect,
  onDeselect,
  onTrash,
  isSelected,
}: {
  item: Table;
  onSelect: (item: Table) => void;
  onDeselect: (item: Table) => void;
  onTrash: (item: Table) => void;
  isSelected: boolean;
}) => {
  const createdAtString = getDateDisplay(item.created_at);

  return (
    <tr>
      <td>
        <Checkbox
          size="xs"
          checked={isSelected}
          onChange={e => (e.target.checked ? onSelect(item) : onDeselect(item))}
        />
      </td>
      <td>
        <Link
          to={Urls.modelToUrl({ model_object: item, model: "table" }) ?? "/"}
          variant="brand"
        >
          {item.display_name}
        </Link>
      </td>
      <td>{createdAtString}</td>
      <td>{item.schema}</td>
      <td>
        <Flex align="center" justify="flex-end">
          <Button
            onClick={() => onTrash(item)}
            variant="subtle"
            className="Button Button--borderless"
            color="text-medium"
          >
            <Icon name="trash" />
          </Button>
        </Flex>
      </td>
    </tr>
  );
};
