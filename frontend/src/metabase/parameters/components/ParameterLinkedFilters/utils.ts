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

/*
 `filteredIds` are the field ids of the parameter which values are being
 filtered, i.e. the ids of fields mapped to the current `parameter`.
 `filteringIds` are the field ids of parameters that can filter the value of the
 current parameter, i.e. potentially all other parameters.
 */
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

/*
  Parses `data` returned from the API call. A `Map` is used to be able to use
  integer keys.
 */
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

/*
  Reverses the Map so the keys are `filteringIds`, and the values are
  `filteredIds`.
 */
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

/*
  Computes the list of parameters that can be linked to the current parameter,
  and adds information about the ids of the fields used for linking.
  `filteredIds` are the field ids of the subset of all fields connected to the
  current parameter that used to link to the other parameter. `filteringIds`
  are the field ids of the subset of all fields connected to the other parameter
  used for linking.

  First of all, for each other parameter, we need to compute the list of field
  ids that can be used to link to the current parameter - `filteringIds`. Then,
  for the `filteringIds` we find the list of field ids that used for mapping in
  the original parameter - `filteredIds`. Then we remove duplicates, and leave
  only parameters where the fields for linking were found.
 */
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
