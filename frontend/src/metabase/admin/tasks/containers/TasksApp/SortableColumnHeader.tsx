import type { ReactNode } from "react";

import { Box, Flex, Icon } from "metabase/ui";
import type { ListTasksRequest } from "metabase-types/api";
import { SortDirection } from "metabase-types/api/sorting";

type SortColumn = NonNullable<ListTasksRequest["sort_column"]>; // TODO: deduplicate, move to ./types

interface Props {
  children: ReactNode;
  column: SortColumn;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}

export const SortableColumnHeader = ({
  children,
  column,
  sortColumn,
  sortDirection,
  onSort,
}: Props) => (
  <Flex align="center" gap="xs" role="button" onClick={() => onSort(column)}>
    {children}

    {sortColumn === column && (
      <Box flex="0 0 auto">
        <Icon
          name={
            sortDirection === SortDirection.Asc ? "chevronup" : "chevrondown"
          }
          size={8}
        />
      </Box>
    )}
  </Flex>
);

// TODO: cursor pointer
// show icon on hover
// style={{ visibility: sortColumn === column ? "visible" : "hidden" }}
