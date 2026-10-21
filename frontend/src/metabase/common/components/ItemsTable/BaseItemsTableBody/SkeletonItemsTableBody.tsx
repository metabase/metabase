import {
  COLLECTION_CONTENT_COLUMNS,
  type CollectionContentTableColumn,
} from "metabase/common/collections/columns";
import type { BaseItemsTableProps } from "metabase/common/components/ItemsTable/BaseItemsTable";
import { Box, Repeat, Skeleton } from "metabase/ui";

import { ITEM_ROW_HEIGHT } from "../BaseItemTableRow";
import { Columns } from "../Columns";
import { EntityIconCheckBoxSkeleton } from "../EntityIconCheckBox";
import { ItemCell, ItemNameCell, TBody } from "../TableElements";
import { COLUMN_RESPONSIVE_PROPS } from "../column-layout";

import S from "./SkeletonItemsTableBody.module.css";

const SKELETON_ROW_COUNT = 7;

const SkeletonText = () => <Skeleton natural h="1rem" />;

const SkeletonIconCell = () => (
  <ItemCell>
    <EntityIconCheckBoxSkeleton />
  </ItemCell>
);

const SKELETON_CELLS = {
  type: SkeletonIconCell,
  name: () => (
    <ItemNameCell>
      <Box>
        <SkeletonText />
      </Box>
    </ItemNameCell>
  ),
  description: () => (
    <ItemCell {...COLUMN_RESPONSIVE_PROPS.description}>
      <SkeletonText />
    </ItemCell>
  ),
  lastEditedBy: () => (
    <ItemCell {...COLUMN_RESPONSIVE_PROPS.lastEditedBy}>
      <SkeletonText />
    </ItemCell>
  ),
  lastEditedAt: () => (
    <ItemCell {...COLUMN_RESPONSIVE_PROPS.lastEditedAt}>
      <SkeletonText />
    </ItemCell>
  ),
  actionMenu: () => <ItemCell />,
  archive: () => <ItemCell />,
} satisfies Record<CollectionContentTableColumn, () => JSX.Element>;

type SkeletonItemsTableBodyProps = Pick<
  BaseItemsTableProps,
  "visibleColumnsMap"
> & {
  canSelect: boolean;
};

/**
 * Placeholder rows shown while the items are loading. The cells follow the
 * order of `COLLECTION_CONTENT_COLUMNS`, which has to match the table header.
 */
export const SkeletonItemsTableBody = ({
  canSelect,
  visibleColumnsMap,
}: SkeletonItemsTableBodyProps) => {
  const visibleColumns = COLLECTION_CONTENT_COLUMNS.filter(
    (column) => visibleColumnsMap[column],
  );

  return (
    <TBody aria-hidden data-testid="items-table-skeleton">
      <Repeat times={SKELETON_ROW_COUNT}>
        <tr className={S.row} style={{ height: ITEM_ROW_HEIGHT }}>
          {canSelect && <SkeletonIconCell />}
          {visibleColumns.map((column) => {
            const SkeletonCell = SKELETON_CELLS[column];
            return <SkeletonCell key={column} />;
          })}
          <Columns.RightEdge.Cell />
        </tr>
      </Repeat>
    </TBody>
  );
};
