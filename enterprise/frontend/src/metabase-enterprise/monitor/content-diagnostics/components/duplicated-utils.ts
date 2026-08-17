import { P, match } from "ts-pattern";
import { t } from "ttag";

import type * as Urls from "metabase/urls";
import type { Sorting } from "metabase/utils/sorting";
import type {
  ContentDiagnosticsDuplicatedSortColumn,
  ContentDiagnosticsFilterType,
} from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "./constants";
import type { DuplicatedContentFilterOptions } from "./types";
import { ALL_FILTER_TYPES, areEntityTypesEqual } from "./utils";

type DuplicateCountFilterOption = {
  value: number;
  label: string;
};

export function getDuplicateCountFilterOptions(): DuplicateCountFilterOption[] {
  return [
    { value: 2, label: t`2 or more` },
    { value: 3, label: t`3 or more` },
    { value: 5, label: t`5 or more` },
    { value: 10, label: t`10 or more` },
  ];
}

export function getDuplicatedDefaultFilterOptions(): DuplicatedContentFilterOptions {
  return {
    entityTypes: ALL_FILTER_TYPES,
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
    minDuplicateCount: undefined,
  };
}

export function getDuplicatedFilterOptions(
  params: Urls.DuplicatedContentParams,
): DuplicatedContentFilterOptions {
  return {
    entityTypes: params.entityTypes ?? ALL_FILTER_TYPES,
    includePersonalCollections:
      params.includePersonalCollections ?? DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
    minDuplicateCount: params.minDuplicateCount,
  };
}

export function areDuplicatedFilterOptionsEqual(
  a: DuplicatedContentFilterOptions,
  b: DuplicatedContentFilterOptions,
): boolean {
  return (
    areEntityTypesEqual(a.entityTypes, b.entityTypes) &&
    a.includePersonalCollections === b.includePersonalCollections &&
    a.minDuplicateCount === b.minDuplicateCount
  );
}

export function getDuplicatedFilterParams(
  filterOptions: DuplicatedContentFilterOptions,
): Pick<
  Urls.DuplicatedContentParams,
  "entityTypes" | "includePersonalCollections" | "minDuplicateCount"
> {
  const isAllTypes =
    filterOptions.entityTypes.length === ALL_FILTER_TYPES.length;
  const isDefaultPersonal =
    filterOptions.includePersonalCollections ===
    DEFAULT_INCLUDE_PERSONAL_COLLECTIONS;
  return {
    entityTypes: isAllTypes ? undefined : filterOptions.entityTypes,
    includePersonalCollections: isDefaultPersonal
      ? undefined
      : filterOptions.includePersonalCollections,
    minDuplicateCount: filterOptions.minDuplicateCount,
  };
}

export function getDuplicatedParamsWithoutDefaults({
  page,
  entityTypes,
  includePersonalCollections,
  ...params
}: Urls.DuplicatedContentParams): Urls.DuplicatedContentParams {
  return {
    ...params,
    page: page === 0 ? undefined : page,
    entityTypes:
      entityTypes?.length === ALL_FILTER_TYPES.length ? undefined : entityTypes,
    includePersonalCollections:
      includePersonalCollections === DEFAULT_INCLUDE_PERSONAL_COLLECTIONS
        ? undefined
        : includePersonalCollections,
  };
}

export function getDuplicatedEntityTypesParam(
  entityTypes: ContentDiagnosticsFilterType[],
): ContentDiagnosticsFilterType[] | undefined {
  return match(entityTypes)
    .when(
      (entityTypes) => entityTypes.length === ALL_FILTER_TYPES.length,
      () => undefined,
    )
    .otherwise((entityTypes) => entityTypes);
}

export function getDuplicatedSortOptions({
  sortColumn,
  sortDirection,
}: Urls.DuplicatedContentParams):
  | Sorting<ContentDiagnosticsDuplicatedSortColumn>
  | undefined {
  return match({ sortColumn, sortDirection })
    .with(
      { sortColumn: P.nonNullable, sortDirection: P.nonNullable },
      ({ sortColumn, sortDirection }) => ({
        column: sortColumn,
        direction: sortDirection,
      }),
    )
    .otherwise(() => undefined);
}
