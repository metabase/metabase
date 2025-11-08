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
import { Repeat } from "metabase/ui";

import { ItemRow } from "./ItemRow";
import type { ModelingItemsTableProps } from "./types";
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

export function ModelingItemsTable({
  items,
  skeleton = false,
}: ModelingItemsTableProps) {
  const [sortingOptions, setSortingOptions] = useState(DEFAULT_SORTING_OPTIONS);

  const sortedItems = useMemo(
    () => sortItems(items, sortingOptions),
    [items, sortingOptions],
  );

  const handleSortingOptionsChange = skeleton ? undefined : setSortingOptions;

  const descriptionWidth = 100;

  return (
    <Table aria-label={skeleton ? undefined : t`Table of models and metrics`}>
      <colgroup>
        <NameColumn {...sharedProps} />
        <TableColumn {...descriptionProps} width={`${descriptionWidth}%`} />
        <TableColumn {...menuProps} width={DOTMENU_WIDTH} />
        <Columns.RightEdge.Col />
      </colgroup>
      <thead>
        <tr>
          <SortableColumnHeader
            name="name"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={handleSortingOptionsChange}
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
            onSortingOptionsChange={handleSortingOptionsChange}
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
        {skeleton ? (
          <Repeat times={7}>
            <ItemRow />
          </Repeat>
        ) : (
          sortedItems.map((item) => (
            <ItemRow item={item} key={`${item.model}-${item.id}`} />
          ))
        )}
      </TBody>
    </Table>
  );
}
