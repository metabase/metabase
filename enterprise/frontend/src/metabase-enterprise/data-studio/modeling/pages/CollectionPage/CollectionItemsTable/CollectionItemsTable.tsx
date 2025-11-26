import { useMemo, useState } from "react";
import { t } from "ttag";

import { NameColumn } from "metabase/browse/components/BrowseTable.styled";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { SortableColumnHeader } from "metabase/common/components/ItemsTable/BaseItemsTable";
import {
  ColumnHeader,
  TBody,
  Table,
  TableColumn,
} from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/common/components/ItemsTable/Columns";
import type { CollectionItem } from "metabase-types/api";

import { ItemRow } from "./ItemRow";
import { DEFAULT_SORTING_OPTIONS, sortItems } from "./utils";

const CONTAINER_NAME = "ItemsTableContainer";
const DOTMENU_WIDTH = 34;

const sharedProps = {
  containerName: CONTAINER_NAME,
};

const descriptionProps = {
  ...sharedProps,
};

const menuProps = {
  ...sharedProps,
};

interface CollectionItemsTableProps {
  items: CollectionItem[];
  skeleton?: boolean;
}

export function CollectionItemsTable({ items }: CollectionItemsTableProps) {
  const [sortingOptions, setSortingOptions] = useState(DEFAULT_SORTING_OPTIONS);

  const sortedItems = useMemo(
    () => sortItems(items, sortingOptions),
    [items, sortingOptions],
  );

  return (
    <Table aria-label={t`Table of models and metrics`}>
      <colgroup>
        <NameColumn {...sharedProps} />
        <TableColumn {...descriptionProps} width="60%" />
        <TableColumn {...menuProps} width={DOTMENU_WIDTH} />
        <Columns.RightEdge.Col />
      </colgroup>
      <thead>
        <tr>
          <SortableColumnHeader
            name="name"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={setSortingOptions}
            {...sharedProps}
            style={{ paddingInlineStart: ".625rem" }}
            columnHeaderProps={{
              style: { paddingInlineEnd: ".5rem" },
            }}
          >
            {t`Name`}
          </SortableColumnHeader>
          <SortableColumnHeader
            name="description"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={setSortingOptions}
            {...descriptionProps}
            columnHeaderProps={{
              style: {
                paddingInline: ".5rem",
              },
            }}
          >
            <Ellipsified>{t`Description`}</Ellipsified>
          </SortableColumnHeader>
          <ColumnHeader
            style={{
              paddingInline: ".5rem",
            }}
          />
          <Columns.RightEdge.Header />
        </tr>
      </thead>
      <TBody>
        {sortedItems.map((item) => (
          <ItemRow item={item} key={`${item.model}-${item.id}`} />
        ))}
      </TBody>
    </Table>
  );
}
