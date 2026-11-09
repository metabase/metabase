import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";

import { useSearchQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { DataSource } from "metabase/embedding-sdk/types/components/data-picker";
import type { SimpleDataPickerProps } from "metabase/plugins";
import type { EmbeddingEntityType } from "metabase/redux/store/embedding-data-picker";
import { Box, Popover } from "metabase/ui";
import type { SearchModel, SearchResult } from "metabase-types/api";
import type { SortingOptions } from "metabase-types/api/sorting";

import { SimpleDataPickerView } from "./SimpleDataPickerView";

export function SimpleDataPicker({
  filterByDatabaseId,
  selectedSource,
  isInitiallyOpen,
  setSourceFn,
  triggerElement,
  entityTypes,
}: SimpleDataPickerProps) {
  const [isDataPickerOpened, { toggle, close }] =
    useDisclosure(isInitiallyOpen);
  const { data, isLoading, error } = useSearchQuery({
    table_db_id: filterByDatabaseId ? filterByDatabaseId : undefined,
    models: translateEntityTypesToSearchModels(entityTypes),
    context: "data-picker",
  });

  const options = useMemo(() => {
    if (!data) {
      return [];
    }

    return sortEntities(data.data, {
      sort_column: "name",
      sort_direction: "asc",
    }).flatMap((entity) => {
      const source = getEntitySource(entity);
      return source != null ? [{ name: entity.name, source }] : [];
    });
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
            selectedSource={selectedSource}
            onClick={(source) => {
              close();
              setSourceFn(source);
            }}
            options={options}
          />
        </DelayedLoadingAndErrorWrapper>
      </Popover.Dropdown>
    </Popover>
  );
}

type SortColumn = keyof SearchResult;

function getEntitySource(entity: SearchResult): DataSource | undefined {
  const { id, model } = entity;
  if (typeof id !== "number") {
    return undefined;
  }
  return model === "dataset" ? { type: "card", id } : { type: "table", id };
}

function sortEntities(
  entities: SearchResult[],
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

  return searchModels;
}
