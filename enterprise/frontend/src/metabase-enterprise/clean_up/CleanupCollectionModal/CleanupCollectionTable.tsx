import { c, t } from "ttag";

import { getCollectionName } from "metabase/collections/utils";
import DateTime from "metabase/components/DateTime";
import { SortableColumnHeader } from "metabase/components/ItemsTable/BaseItemsTable";
import {
  ColumnHeader,
  ItemCell,
  Table,
  TableColumn,
  TBody,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/components/ItemsTable/Columns";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { FixedSizeIcon, Flex, Tooltip } from "metabase/ui";
import type { StaleCollectionItem } from "metabase-types/api";
import type { SortingOptions } from "metabase-types/api/sorting";

import CS from "./CleanupCollectionTable.module.css";
import { itemKeyFn } from "./utils";

interface CleanupCollectionTableProps {
  items: StaleCollectionItem[];
  sortingOptions: SortingOptions;
  onSortingOptionsChange?: (newSortingOptions: SortingOptions) => void;
  selectedItems?: StaleCollectionItem[];
  hasUnselected?: boolean;
  getIsSelected: (item: StaleCollectionItem) => boolean;
  onToggleSelected: (item: StaleCollectionItem) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
}

export const CleanupCollectionTable = ({
  items,
  sortingOptions,
  onSortingOptionsChange,
  selectedItems,
  hasUnselected,
  getIsSelected,
  onToggleSelected,
  onSelectAll,
  onSelectNone,
}: CleanupCollectionTableProps) => (
  <div className={CS.tableContainer}>
    <Table className={CS.table} cellPadding="0" cellSpacing="0">
      <colgroup>
        {/* Select */}
        <Columns.Select.Col />
        {/* Name */}
        <Columns.Name.Col isInDragLayer={false} />
        {/* Collection */}
        <TableColumn width="280px" />
        {/* Last used at */}
        <TableColumn width="160px" />
      </colgroup>
      <thead className={CS.tableHead}>
        <tr>
          {/* Select */}
          <Columns.Select.Header
            selectedItems={selectedItems}
            hasUnselected={hasUnselected}
            onSelectAll={onSelectAll}
            onSelectNone={onSelectNone}
          />
          {/* Name */}
          <SortableColumnHeader
            name="name"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          >
            <Ellipsified>{t`Name`}</Ellipsified>
          </SortableColumnHeader>
          {/* Collection */}
          <ColumnHeader>
            <Ellipsified>{t`Collection`}</Ellipsified>
          </ColumnHeader>
          {/* Last used at */}
          <SortableColumnHeader
            name="last_used_at"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          >
            {c(`Describes the date something was last used`).t`Last used at`}
          </SortableColumnHeader>
        </tr>
      </thead>
      <TBody>
        {items.map(item => (
          <tr key={itemKeyFn(item)}>
            {/* Select */}
            <Columns.Select.Cell
              testIdPrefix="clean-up-table"
              icon={item.getIcon()}
              isPinned={false}
              isSelected={getIsSelected(item)}
              handleSelectionToggled={() => onToggleSelected(item)}
            />
            {/* Name */}
            <ItemCell data-testid="clean-up-table-collection">
              <Flex align="center" gap="sm">
                <FixedSizeIcon
                  name={item.getIcon().name}
                  color="var(--mb-color-brand)"
                />
                <Ellipsified>{item.name}</Ellipsified>
              </Flex>
            </ItemCell>
            {/* Collection */}
            <ItemCell data-testid="clean-up-table-collection">
              {item.collection && (
                <Flex align="center" gap="sm">
                  <FixedSizeIcon name="folder" />
                  <Ellipsified>
                    {getCollectionName(item.collection)}
                  </Ellipsified>
                </Flex>
              )}
            </ItemCell>
            {/* Last used at */}
            <ItemCell
              data-testid="clean-up-table-last-used-at"
              data-server-date
            >
              <Tooltip label={<DateTime value={item.last_used_at} />}>
                <DateTime unit="day" value={item.last_used_at} />
              </Tooltip>
            </ItemCell>
          </tr>
        ))}
      </TBody>
    </Table>
  </div>
);
