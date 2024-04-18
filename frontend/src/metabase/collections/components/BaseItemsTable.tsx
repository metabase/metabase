import PropTypes from "prop-types";
import { t } from "ttag";

import CheckBox from "metabase/core/components/CheckBox";

import {
  ColumnHeader,
  Table,
  SortingIcon,
  SortingControlContainer,
  TBody,
  LastEditedByCol,
  BulkSelectWrapper,
} from "./BaseItemsTable.styled";
import BaseTableItem, {BaseTableItemProps} from "./BaseTableItem";
import type {Bookmark, Collection, CollectionItem, } from "metabase-types/api";
import type {ItemWithLastEditInfo} from "metabase/components/LastEditInfoLabel/LastEditInfoLabel";
import type {HTMLAttributes, ReactNode} from "react";
import type {CreateBookmark, DeleteBookmark, OnCopy, OnMove, OnToggleSelected} from "../types";
import type Database from "metabase-lib/v1/metadata/Database";

type SortingOptions = {
  sort_column: string;
  sort_direction: 'asc' | 'desc';
};

type SortableColumnHeaderProps = {
  name: string;
  sortingOptions: SortingOptions;
  onSortingOptionsChange: (newSortingOptions: SortingOptions) => void;
  children?: ReactNode;
} & Partial<HTMLAttributes<HTMLDivElement>>;

export enum Sort {
  Asc = "asc",
  Desc = "desc",
}

const SortableColumnHeader = ({
  name,
  sortingOptions,
  onSortingOptionsChange,
  children,
  ...props
}: SortableColumnHeaderProps) => {
  const isSortingThisColumn = sortingOptions.sort_column === name;
  const direction = isSortingThisColumn
    ? sortingOptions.sort_direction
    : Sort.Desc;

  const onSortingControlClick = () => {
    const nextDirection = direction === Sort.Asc ? Sort.Desc : Sort.Asc;
    onSortingOptionsChange({
      sort_column: name,
      sort_direction: nextDirection,
    });
  };

  return (
    <ColumnHeader>
      <SortingControlContainer
        {...props}
        isActive={isSortingThisColumn}
        onClick={onSortingControlClick}
        role="button"
      >
        {children}
        <SortingIcon name={direction === Sort.Asc ? "chevronup" : "chevrondown"} />
      </SortingControlContainer>
    </ColumnHeader>
  );
}

interface BaseItemsTableProps {
  items: CollectionItem[];
  collection: Collection;
  databases: Database[]
  bookmarks?: Bookmark[];
  createBookmark?: CreateBookmark;
  deleteBookmark?: DeleteBookmark;
  selectedItems?: CollectionItem[];
  hasUnselected?: boolean;
  isPinned?: boolean;
  renderItem?: (props: ItemRendererProps) => JSX.Element;
  sortingOptions: SortingOptions;
  onSortingOptionsChange: () => void;
  onToggleSelected?: OnToggleSelected;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  onCopy?: OnCopy;
  onMove?: OnMove;
  onDrop?: () => void;
  getIsSelected?: (item: any) => boolean;
  /** Used for dragging */
  headless?: boolean;
}

type ItemRendererProps = {
  item: CollectionItem;
} & BaseTableItemProps;

const defaultItemRenderer = ({ item, ...props }: ItemRendererProps) => {
  return (
    <BaseTableItem key={`${item.model}-${item.id}`} item={item} {...props} />
  );
}

const BaseItemsTable = ({
  databases,
  bookmarks,
  createBookmark,
  deleteBookmark,
  items,
  collection,
  selectedItems,
  hasUnselected,
  isPinned,
  renderItem = defaultItemRenderer,
  onCopy,
  onMove,
  onDrop,
  sortingOptions,
  onSortingOptionsChange,
  onToggleSelected,
  onSelectAll,
  onSelectNone,
  getIsSelected = () => false,
  headless = false,
  ...props
} : BaseItemsTableProps) => {
  const itemRenderer = (item: CollectionItem) =>
    renderItem({
      databases,
      bookmarks,
      createBookmark,
      deleteBookmark,
      item,
      collection,
      selectedItems,
      isSelected: getIsSelected(item),
      isPinned,
      onCopy,
      onMove,
      onDrop,
      onToggleSelected,
    });

  const canSelect = collection.can_write || false;

  return (
    <Table canSelect={canSelect} {...props}>
      <colgroup>
        {canSelect && <col style={{ width: "70px" }} />}
        <col style={{ width: "70px" }} />
        <col />
        <LastEditedByCol />
        <col style={{ width: "140px" }} />
        <col style={{ width: "100px" }} />
      </colgroup>
      {!headless && (
        <thead
          data-testid={
            isPinned ? "pinned-items-table-head" : "items-table-head"
          }
        >
          <tr>
            {canSelect && (
              <ColumnHeader>
                <BulkSelectWrapper>
                  <CheckBox
                    checked={!!selectedItems?.length}
                    indeterminate={
                      (!!selectedItems?.length && !!hasUnselected)
                    }
                    onChange={hasUnselected ? onSelectAll : onSelectNone}
                    aria-label={t`Select all items`}
                  />
                </BulkSelectWrapper>
              </ColumnHeader>
            )}
            <SortableColumnHeader
              name="model"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
              // FIXME: Use marginInlineStart
              style={{ marginLeft: 6 }}
            >
              {t`Type`}
            </SortableColumnHeader>
            <SortableColumnHeader
              name="name"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            >
              {t`Name`}
            </SortableColumnHeader>
            <SortableColumnHeader
              name="last_edited_by"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            >
              {t`Last edited by`}
            </SortableColumnHeader>
            <SortableColumnHeader
              name="last_edited_at"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={onSortingOptionsChange}
            >
              {t`Last edited at`}
            </SortableColumnHeader>
            <th></th>
          </tr>
        </thead>
      )}
      <TBody>{items.map(itemRenderer)}</TBody>
    </Table>
  );
}

BaseItemsTable.Item = BaseTableItem;

export default BaseItemsTable;
