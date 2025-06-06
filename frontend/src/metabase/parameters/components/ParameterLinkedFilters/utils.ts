import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import type {
  FieldId,
  GetValidDashboardFilterFieldsRequest,
} from "metabase-types/api";

export type LinkedParameterInfo = {
  parameter: UiParameter;
  filteredIds: FieldId[];
  filteringIds: FieldId[];
};

function getFieldIds(parameter: UiParameter): FieldId[] {
  return getFields(parameter).map((field) => Number(field.id));
}

export function getFilterFieldsRequest(
  parameter: UiParameter,
  otherParameters: UiParameter[],
): GetValidDashboardFilterFieldsRequest | undefined {
  const filteredIds = getFieldIds(parameter);
  const filteringIds = Array.from(
    new Set(otherParameters.flatMap(getFieldIds)),
  );
  if (filteredIds.length > 0 && filteringIds.length > 0) {
    return { filtered: filteredIds, filtering: filteringIds };
  }
}

function getFilteringIdsByFilteredId(
  data: Record<FieldId, FieldId[]>,
): Map<FieldId, FieldId[]> {
  return new Map<FieldId, FieldId[]>(
    Object.entries(data).map(([filteredId, filteringIds]) => [
      parseInt(filteredId, 10),
      filteringIds,
    ]),
  );
}

function getFilteredIdsByFilteringId(
  filteringIdsByFilteredId: Map<FieldId, FieldId[]>,
): Map<FieldId, FieldId[]> {
  const filteredIdsByFilteringId = new Map<FieldId, FieldId[]>();
  filteringIdsByFilteredId.forEach((filteringIds, filteredId) => {
    filteringIds.forEach((filteringId) => {
      const filteredIds = filteredIdsByFilteringId.get(filteringId) ?? [];
      filteredIdsByFilteringId.set(filteringId, [...filteredIds, filteredId]);
    });
  });

  return filteredIdsByFilteringId;
}

function getLinkedParametersInfoForMapping(
  otherParameters: UiParameter[],
  filteredIdsByFilteringId: Map<FieldId, FieldId[]>,
): LinkedParameterInfo[] {
  return otherParameters
    .map((parameter) => {
      const filteringIds = getFieldIds(parameter).filter((filteringId) =>
        filteredIdsByFilteringId.has(filteringId),
      );
      const filteredIds = filteringIds.flatMap(
        (filteringId) => filteredIdsByFilteringId.get(filteringId) ?? [],
      );

      return {
        parameter,
        filteredIds: Array.from(new Set(filteredIds)),
        filteringIds,
      };
    })
    .filter(
      ({ filteredIds, filteringIds }) =>
        filteredIds.length > 0 && filteringIds.length > 0,
    );
}

export function getLinkedParametersInfo(
  otherParameters: UiParameter[],
  fieldIds: Record<FieldId, FieldId[]>,
): LinkedParameterInfo[] {
  const filteringIdsByFilteredId = getFilteringIdsByFilteredId(fieldIds);
  const filteredIdsByFilteringId = getFilteredIdsByFilteringId(
    filteringIdsByFilteredId,
  );
  return getLinkedParametersInfoForMapping(
    otherParameters,
    filteredIdsByFilteringId,
  );
}
