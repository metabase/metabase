import { P, match } from "ts-pattern";
import { t } from "ttag";

import type * as Urls from "metabase/urls";
import type { Sorting } from "metabase/utils/sorting";
import {
  CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
  type ContentDiagnosticsNonCollectionFilterType,
  type ContentDiagnosticsSlowSortColumn,
} from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "./constants";
import type { SlowContentFilterOptions } from "./types";
import { areEntityTypesEqual } from "./utils";

const ALL_FILTER_TYPES: ContentDiagnosticsNonCollectionFilterType[] = [
  ...CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
];

type DurationFilterOption = {
  value: number;
  label: string;
};

export function getDurationFilterOptions(): DurationFilterOption[] {
  return [
    { value: 15000, label: t`15 seconds or more` },
    { value: 30000, label: t`30 seconds or more` },
    { value: 60000, label: t`1 minute or more` },
    { value: 300000, label: t`5 minutes or more` },
  ];
}

export function getSlowDefaultFilterOptions(): SlowContentFilterOptions {
  return {
    entityTypes: ALL_FILTER_TYPES,
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
    minDurationMs: undefined,
  };
}

export function getSlowFilterOptions(
  params: Urls.SlowContentParams,
): SlowContentFilterOptions {
  return {
    entityTypes: params.entityTypes ?? ALL_FILTER_TYPES,
    includePersonalCollections:
      params.includePersonalCollections ?? DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
    minDurationMs: params.minDurationMs,
  };
}

export function areSlowFilterOptionsEqual(
  a: SlowContentFilterOptions,
  b: SlowContentFilterOptions,
): boolean {
  return (
    areEntityTypesEqual(a.entityTypes, b.entityTypes) &&
    a.includePersonalCollections === b.includePersonalCollections &&
    a.minDurationMs === b.minDurationMs
  );
}

export function getSlowFilterParams(
  filterOptions: SlowContentFilterOptions,
): Pick<
  Urls.SlowContentParams,
  "entityTypes" | "includePersonalCollections" | "minDurationMs"
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
    minDurationMs: filterOptions.minDurationMs,
  };
}

export function getSlowParamsWithoutDefaults({
  page,
  entityTypes,
  includePersonalCollections,
  ...params
}: Urls.SlowContentParams): Urls.SlowContentParams {
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

export function getSlowEntityTypesParam(
  entityTypes: ContentDiagnosticsNonCollectionFilterType[],
): ContentDiagnosticsNonCollectionFilterType[] | undefined {
  return match(entityTypes)
    .when(
      (entityTypes) => entityTypes.length === ALL_FILTER_TYPES.length,
      () => undefined,
    )
    .otherwise((entityTypes) => entityTypes);
}

export function getSlowSortOptions({
  sortColumn,
  sortDirection,
}: Urls.SlowContentParams):
  | Sorting<ContentDiagnosticsSlowSortColumn>
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
