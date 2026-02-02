import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";

import { useSearchQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { SimpleDataPickerProps } from "metabase/plugins";
import { Box, Popover } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { SearchModel, SearchResult, TableId } from "metabase-types/api";
import type { SortingOptions } from "metabase-types/api/sorting";
import type { ModularEmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

import { SimpleDataPickerView } from "./SimpleDataPickerView";

export function SimpleDataPicker({
  filterByDatabaseId,
  selectedEntity,
  isInitiallyOpen,
  setSourceTableFn,
  triggerElement,
  entityTypes,
}: SimpleDataPickerProps) {
  const [isDataPickerOpened, { toggle, close }] =
    useDisclosure(isInitiallyOpen);
  const { data, isLoading, error } = useSearchQuery({
    table_db_id: filterByDatabaseId ? filterByDatabaseId : undefined,
    models: translateEntityTypesToSearchModels(entityTypes),
  });

  const options = useMemo(() => {
    if (!data) {
      return [];
    }

    return sortEntities(
      data.data.map((entity) => {
        return {
          ...entity,
          id:
            entity.model === "dataset"
              ? getQuestionVirtualTableId(entity.id)
              : entity.id,
        };
      }),
      { sort_column: "name", sort_direction: "asc" },
    );
  }, [data]);

  return (
    <Popover
      opened={isDataPickerOpened}
      position="bottom-start"
      onChange={(isOpen) => {
        if (!isOpen) {
          close();
        }
      }}
      trapFocus
    >
      <Popover.Target>
        <Box
          onClick={toggle}
          data-testid="embedding-simple-data-picker-trigger"
        >
          {triggerElement}
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
          <SimpleDataPickerView
            selectedEntity={selectedEntity}
            onClick={(tableId) => {
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

type SortColumn = keyof SearchResult;

function sortEntities(
  entities: SearchResult<TableId>[],
  sort: SortingOptions<SortColumn>,
) {
  const { sort_column, sort_direction } = sort;

  return [...entities].sort((entityA, entityB) => {
    const aValue = entityA[sort_column] ?? "";
    const bValue = entityB[sort_column] ?? "";

    const result = compareString(aValue, bValue);

    // No need to check for 0 since -0 and 0 are equal
    return sort_direction === "asc" ? result : -result;
  });
}

const compareString = (a: string, b: string) => a.localeCompare(b);

function translateEntityTypesToSearchModels(
  entityTypes: ModularEmbeddingEntityType[],
): SearchModel[] {
  const searchModels: SearchModel[] = [];

  if (entityTypes.includes("model")) {
    searchModels.push("dataset");
  }

  if (entityTypes.includes("table")) {
    searchModels.push("table");
  }

  return searchModels;
}
