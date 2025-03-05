import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useMemo } from "react";

import { useSearchQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Popover } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { SearchResult, TableId } from "metabase-types/api";
import { SortDirection } from "metabase-types/api/sorting";

import { SimpleDataPickerView } from "./SimpleDataPickerView";

interface SimpleDataPickerProps {
  filterByDatabaseId: number | null;
  selectedEntity?: TableId;
  isInitiallyOpen: boolean;
  triggerElement: ReactNode;
  setSourceTableFn: (tableId: TableId) => void;
}

export function SimpleDataPicker({
  filterByDatabaseId,
  selectedEntity,
  isInitiallyOpen,
  setSourceTableFn,
  triggerElement,
}: SimpleDataPickerProps) {
  const [isDataPickerOpened, { toggle, close }] =
    useDisclosure(isInitiallyOpen);
  const { data, isLoading, error } = useSearchQuery({
    table_db_id: filterByDatabaseId ? filterByDatabaseId : undefined,
    models: ["dataset", "table"],
  });

  const options = useMemo(() => {
    if (!data) {
      return [];
    }

    return sortEntities(
      data.data.map(entity => {
        return {
          ...entity,
          id:
            entity.model === "dataset"
              ? getQuestionVirtualTableId(entity.id)
              : entity.id,
        };
      }),
      { sort_column: "name", sort_direction: SortDirection.Asc },
    );
  }, [data]);

  return (
    <Popover
      opened={isDataPickerOpened}
      position="bottom-start"
      onChange={isOpen => {
        if (!isOpen) {
          close();
        }
      }}
      trapFocus
    >
      <Popover.Target>
        <Box onClick={toggle}>{triggerElement}</Box>
      </Popover.Target>
      <Popover.Dropdown>
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
          <SimpleDataPickerView
            selectedEntity={selectedEntity}
            onClick={tableId => {
              close();
              setSourceTableFn(tableId);
            }}
            options={options}
          />
        </DelayedLoadingAndErrorWrapper>
      </Popover.Dropdown>
    </Popover>
  );
}

function sortEntities(
  entities: SearchResult<TableId>[],
  sort: { sort_column: keyof SearchResult; sort_direction: SortDirection },
) {
  const { sort_column, sort_direction } = sort;

  return [...entities].sort((entityA, entityB) => {
    const aValue = entityA[sort_column] ?? "";
    const bValue = entityB[sort_column] ?? "";

    const result = compareString(aValue, bValue);

    // No need to check for 0 since -0 and 0 are equal
    return sort_direction === SortDirection.Asc ? result : -result;
  });
}

const compareString = (a: string, b: string) => a.localeCompare(b);
