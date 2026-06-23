import { cardApi, dashboardApi, datasetApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { createThunkAction } from "metabase/redux";
import type { Dispatch, GetState } from "metabase/redux/store";
import { FieldSchema } from "metabase/schema";
import type Field from "metabase-lib/v1/metadata/Field";
import { hasRemappedParameterValues } from "metabase-lib/v1/parameters/utils/parameter-source";
import { normalizeParameter } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  CardId,
  DashboardId,
  FieldId,
  FieldValue,
  Parameter,
  RowValue,
} from "metabase-types/api";

import { updateMetadata } from "./metadata";

export const addRemappings =
  (fieldId: FieldId, remappings: FieldValue[]) =>
  (dispatch: Dispatch, getState: GetState) => {
    const existing = getState().entities.fields?.[fieldId]?.remappings ?? [];
    const merged = Array.from(
      new Map(
        existing
          .concat(remappings)
          .map((remapping): [RowValue, FieldValue] => [
            remapping[0],
            remapping,
          ]),
      ).values(),
    );
    return dispatch(
      updateMetadata({ id: fieldId, remappings: merged }, FieldSchema),
    );
  };

type FetchRemappingOptions = {
  parameter?: Parameter | null;
  value: RowValue;
  field?: Field | null;
  cardId?: CardId | null;
  dashboardId?: DashboardId | null;
  uuid?: string | null;
  token?: string | null;
};

const FETCH_REMAPPING = "metabase/remappings/FETCH_REMAPPING";
export const fetchRemapping = createThunkAction(
  FETCH_REMAPPING,
  ({
    parameter,
    value,
    field,
    cardId,
    dashboardId,
    uuid,
    token,
  }: FetchRemappingOptions) =>
    async (dispatch: Dispatch) => {
      if (field != null && field.hasRemappedValue(value)) {
        return;
      }

      if (
        parameter == null ||
        !hasRemappedParameterValues(parameter, field ? [field] : [])
      ) {
        return;
      }

      const entityIdentifier = uuid ?? token ?? null;
      let remapping: FieldValue | undefined;
      if (dashboardId != null) {
        remapping = await runRtkEndpoint(
          {
            ...(entityIdentifier
              ? { entityIdentifier }
              : { dashboard_id: dashboardId }),
            parameter_id: parameter.id,
            value,
          },
          dispatch,
          dashboardApi.endpoints.getRemappedDashboardParameterValue,
          { forceRefetch: false },
        );
      } else if (cardId != null) {
        remapping = await runRtkEndpoint(
          {
            ...(entityIdentifier ? { entityIdentifier } : { card_id: cardId }),
            parameter_id: parameter.id,
            value,
          },
          dispatch,
          cardApi.endpoints.getRemappedCardParameterValue,
          { forceRefetch: false },
        );
      } else if (field != null) {
        // Field-based remapping (e.g. FK display fields). Static-list sources
        // carry their [value, label] pairs inline and need no network call.
        remapping = await runRtkEndpoint(
          {
            parameter: normalizeParameter(parameter),
            field_ids: [field.id],
            value,
          },
          dispatch,
          datasetApi.endpoints.getRemappedParameterValue,
          { forceRefetch: false },
        );
      }

      if (remapping == null) {
        return;
      }

      const fieldId = field?.id;
      if (typeof fieldId === "number") {
        dispatch(addRemappings(fieldId, [remapping]));
      }

      return remapping;
    },
);
