import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import _ from "underscore";

import { skipToken, useSearchQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PLUGIN_LIBRARY, type SimpleDataPickerProps } from "metabase/plugins";
import type { EmbeddingEntityType } from "metabase/redux/store/embedding-data-picker";
import { Box, Popover } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { SearchModel, SearchResult, TableId } from "metabase-types/api";
import type { SortingOptions } from "metabase-types/api/sorting";

import { SimpleDataPickerView } from "./SimpleDataPickerView";

export function SimpleDataPicker({
  filterByDatabaseId,
  isJoinStep,
  selectedEntity,
  isInitiallyOpen,
  setSourceTableFn,
  triggerElement,
  entityTypes,
}: SimpleDataPickerProps) {
  const [isDataPickerOpened, { toggle, close }] =
    useDisclosure(isInitiallyOpen);
  const searchModels = translateEntityTypesToSearchModels(entityTypes);
  const { data, isLoading, error } = useSearchQuery(
    searchModels.length > 0
      ? {
          table_db_id: filterByDatabaseId ? filterByDatabaseId : undefined,
          models: searchModels,
          context: "data-picker",
        }
      : skipToken,
  );
  const {
    data: libraryData,
    isLoading: isLibraryLoading,
    error: libraryError,
  } = useLibrarySearch({ entityTypes, filterByDatabaseId, isJoinStep });

  const options = useMemo(() => {
    const entities = _.uniq(
      [...(data?.data ?? []), ...(libraryData?.data ?? [])],
      false,
      (entity) => `${entity.model}-${entity.id}`,
    );

    return sortEntities(
      entities.map((entity) => {
        return {
          ...entity,
          id:
            entity.model === "dataset" || entity.model === "metric"
              ? getQuestionVirtualTableId(entity.id)
              : entity.id,
        };
      }),
      { sort_column: "name", sort_direction: "asc" },
    );
  }, [data, libraryData]);

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
        <DelayedLoadingAndErrorWrapper
          loading={isLoading || isLibraryLoading}
          error={error ?? libraryError}
        >
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

/**
 * Searches the tables and metrics published in the Library when `entityTypes`
 * includes `library`. Returns no data without a Library the user can read.
 */
function useLibrarySearch({
  entityTypes,
  filterByDatabaseId,
  isJoinStep,
}: Pick<
  SimpleDataPickerProps,
  "entityTypes" | "filterByDatabaseId" | "isJoinStep"
>) {
  const { data: libraryCollection, isLoading: isLibraryCollectionLoading } =
    PLUGIN_LIBRARY.useGetLibraryCollection({
      skip: !entityTypes.includes("library"),
    });
  const { data, isLoading, error } = useSearchQuery(
    libraryCollection
      ? {
          table_db_id: filterByDatabaseId ? filterByDatabaseId : undefined,
          models: isJoinStep ? ["table"] : ["table", "metric"],
          collection: libraryCollection.id,
          context: "data-picker",
        }
      : skipToken,
  );

  return { data, isLoading: isLibraryCollectionLoading || isLoading, error };
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
  entityTypes: EmbeddingEntityType[],
): SearchModel[] {
  const searchModels: SearchModel[] = [];

  if (entityTypes.includes("model")) {
    searchModels.push("dataset");
  }

  if (entityTypes.includes("table")) {
    searchModels.push("table");
  }

  if (entityTypes.includes("metric")) {
    searchModels.push("metric");
  }

  return searchModels;
}
