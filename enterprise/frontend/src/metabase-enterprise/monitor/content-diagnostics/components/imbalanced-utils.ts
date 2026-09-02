import { P, match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import type * as Urls from "metabase/urls";
import type { Sorting } from "metabase/utils/sorting";
import type {
  ContentDiagnosticsFilterType,
  ContentDiagnosticsImbalancedFindingType,
  ContentDiagnosticsImbalancedSortColumn,
  ContentDiagnosticsImbalancedUnit,
} from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "./constants";
import type { ImbalancedContentFilterOptions } from "./types";
import { ALL_FILTER_TYPES, areEntityTypesEqual } from "./utils";

export function getImbalancedDefaultFilterOptions(): ImbalancedContentFilterOptions {
  return {
    entityTypes: ALL_FILTER_TYPES,
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

export function getImbalancedFilterOptions(
  params: Urls.ImbalancedContentParams,
): ImbalancedContentFilterOptions {
  return {
    entityTypes: params.entityTypes ?? ALL_FILTER_TYPES,
    includePersonalCollections:
      params.includePersonalCollections ?? DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

export function areImbalancedFilterOptionsEqual(
  a: ImbalancedContentFilterOptions,
  b: ImbalancedContentFilterOptions,
): boolean {
  return (
    areEntityTypesEqual(a.entityTypes, b.entityTypes) &&
    a.includePersonalCollections === b.includePersonalCollections
  );
}

export function getImbalancedFilterParams(
  filterOptions: ImbalancedContentFilterOptions,
): Pick<
  Urls.ImbalancedContentParams,
  "entityTypes" | "includePersonalCollections"
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
  };
}

export function getImbalancedParamsWithoutDefaults({
  page,
  entityTypes,
  includePersonalCollections,
  ...params
}: Urls.ImbalancedContentParams): Urls.ImbalancedContentParams {
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

export function getImbalancedEntityTypesParam(
  entityTypes: ContentDiagnosticsFilterType[],
): ContentDiagnosticsFilterType[] | undefined {
  return match(entityTypes)
    .when(
      (entityTypes) => entityTypes.length === ALL_FILTER_TYPES.length,
      () => undefined,
    )
    .otherwise((entityTypes) => entityTypes);
}

export function getImbalancedSortOptions({
  sortColumn,
  sortDirection,
}: Urls.ImbalancedContentParams):
  | Sorting<ContentDiagnosticsImbalancedSortColumn>
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

export function getImbalancedEmptyStateLabel(
  mode: ContentDiagnosticsImbalancedFindingType,
): string {
  return match(mode)
    .with("empty", () => t`No empty content found`)
    .with("sparse", () => t`No sparse content found`)
    .with("crowded", () => t`No crowded content found`)
    .exhaustive();
}

export function getContentCountLabel(
  count: number,
  unit: ContentDiagnosticsImbalancedUnit,
): string {
  return match(unit)
    .with("items", () =>
      ngettext(msgid`${count} item`, `${count} items`, count),
    )
    .with("dashcards", () =>
      ngettext(msgid`${count} dashcard`, `${count} dashcards`, count),
    )
    .with("rows", () => ngettext(msgid`${count} row`, `${count} rows`, count))
    .with("cards", () =>
      ngettext(msgid`${count} card`, `${count} cards`, count),
    )
    .with("tabs", () => ngettext(msgid`${count} tab`, `${count} tabs`, count))
    .otherwise(() => `${count} ${unit}`);
}
