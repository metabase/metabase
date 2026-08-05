import { P, match } from "ts-pattern";
import { t } from "ttag";

import type * as Urls from "metabase/urls";
import type { Sorting } from "metabase/utils/sorting";
import {
  CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
  type ContentDiagnosticsNonCollectionEntityType,
  type ContentDiagnosticsNonCollectionFilterType,
  type ContentDiagnosticsStaleSortColumn,
} from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "./constants";
import type { StaleContentFilterOptions } from "./types";
import { areEntityTypesEqual } from "./utils";

const ALL_FILTER_TYPES: ContentDiagnosticsNonCollectionFilterType[] = [
  ...CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
];

export function getLastActiveLabel(
  entityType: ContentDiagnosticsNonCollectionEntityType,
): string {
  return match(entityType)
    .with("card", () => t`Last used`)
    .with("dashboard", () => t`Last viewed`)
    .with("document", () => t`Last viewed`)
    .with("transform", () => t`Last run`)
    .exhaustive();
}

export function getStaleDefaultFilterOptions(): StaleContentFilterOptions {
  return {
    entityTypes: ALL_FILTER_TYPES,
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

export function getStaleFilterOptions(
  params: Urls.StaleContentParams,
): StaleContentFilterOptions {
  return {
    entityTypes: params.entityTypes ?? ALL_FILTER_TYPES,
    includePersonalCollections:
      params.includePersonalCollections ?? DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

export function areStaleFilterOptionsEqual(
  a: StaleContentFilterOptions,
  b: StaleContentFilterOptions,
): boolean {
  return (
    areEntityTypesEqual(a.entityTypes, b.entityTypes) &&
    a.includePersonalCollections === b.includePersonalCollections
  );
}

export function getStaleFilterParams(
  filterOptions: StaleContentFilterOptions,
): Pick<Urls.StaleContentParams, "entityTypes" | "includePersonalCollections"> {
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
  };
}

export function getStaleParamsWithoutDefaults({
  page,
  entityTypes,
  includePersonalCollections,
  ...params
}: Urls.StaleContentParams): Urls.StaleContentParams {
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

export function getStaleEntityTypesParam(
  entityTypes: ContentDiagnosticsNonCollectionFilterType[],
): ContentDiagnosticsNonCollectionFilterType[] | undefined {
  return match(entityTypes)
    .when(
      (entityTypes) => entityTypes.length === ALL_FILTER_TYPES.length,
      () => undefined,
    )
    .otherwise((entityTypes) => entityTypes);
}

export function getStaleSortOptions({
  sortColumn,
  sortDirection,
}: Urls.StaleContentParams):
  | Sorting<ContentDiagnosticsStaleSortColumn>
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
