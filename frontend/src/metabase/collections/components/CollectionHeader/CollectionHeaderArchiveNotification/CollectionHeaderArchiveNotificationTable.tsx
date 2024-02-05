import { t } from "ttag";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import CheckBox from "metabase/core/components/CheckBox";
import {
  ColumnHeader,
  BulkSelectWrapper,
  TBody,
} from "metabase/collections/components/BaseItemsTable.styled";
import { Icon, Text } from "metabase/ui";
import { getItemId, getItemIds } from "./utils";
import { ArchiveTable } from "./CollectionHeaderArchiveNotification.styled";
import type { Item } from "./utils";

interface CollectionHeaderArchiveNotificationTableProps {
  selectedIds: Set<string>;
  items: Item[];
  onSelectIdsChange: (ids: Set<string>) => void;
}

export const CollectionHeaderArchiveNotificationTable = ({
  items,
  selectedIds,
  onSelectIdsChange,
}: CollectionHeaderArchiveNotificationTableProps) => {
  const isAllSelected = items.length === selectedIds.size;
  const isSomeSelected = selectedIds.size > 0;

  const toggleSelection = () => {
    onSelectIdsChange(isAllSelected ? new Set() : getItemIds(items));
  };

  return (
    <ArchiveTable canSelect>
      <thead>
        <ColumnHeader style={{ width: "3em" }}>
          <BulkSelectWrapper>
            <CheckBox
              checked={isSomeSelected}
              indeterminate={isSomeSelected && !isAllSelected}
              onChange={toggleSelection}
              aria-label={
                isAllSelected ? t`Deselect all items` : t`Select all items`
              }
            />
          </BulkSelectWrapper>
        </ColumnHeader>
        <ColumnHeader style={{ width: "2em" }}>{t`Type`}</ColumnHeader>
        <ColumnHeader>{t`Name`}</ColumnHeader>
        <ColumnHeader
          style={{ textAlign: "right" }}
        >{t`Last used at`}</ColumnHeader>
      </thead>
      <TBody>
        {items.map(item => {
          const isSelected = selectedIds.has(getItemId(item));

          return (
            <tr key={item.id}>
              <td>
                <CheckBox
                  style={{ paddingLeft: 14 }}
                  checked={isSelected}
                  indeterminate={false}
                  onChange={() => {
                    const nextIds = new Set([...selectedIds]);
                    if (isSelected) {
                      nextIds.delete(getItemId(item));
                    } else {
                      nextIds.add(getItemId(item));
                    }
                    onSelectIdsChange(nextIds);
                  }}
                />
              </td>
              <td>
                <Icon
                  name={item.model === "card" ? "table" : "string"}
                  size={12}
                />
              </td>
              <td>
                <Text weight="bold">{item.name}</Text>
              </td>
              <td style={{ textAlign: "right" }}>
                <Text weight="bold">
                  {formatDateTimeWithUnit(item.last_used_at, "day")}
                </Text>
              </td>
            </tr>
          );
        })}
      </TBody>
    </ArchiveTable>
  );
};
