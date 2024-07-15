import { denormalize, normalize, schema } from "normalizr";

import {
  getDashboardById,
  getDashCardById,
  getParameterValues,
} from "metabase/dashboard/selectors";
import {
  expandInlineDashboard,
  getDashboardType,
} from "metabase/dashboard/utils";
import Dashboards from "metabase/entities/dashboards";
import type { Deferred } from "metabase/lib/promise";
import { defer } from "metabase/lib/promise";
import { createAsyncThunk } from "metabase/lib/redux";
import { uuid } from "metabase/lib/uuid";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";
import { addFields, addParamValues } from "metabase/redux/metadata";
import { AutoApi, DashboardApi, EmbedApi, PublicApi } from "metabase/services";
import type { DashboardCard, DashboardId } from "metabase-types/api";

// normalizr schemas
const dashcard = new schema.Entity("dashcard");
const dashboard = new schema.Entity("dashboard", {
  dashcards: [dashcard],
});

let fetchDashboardCancellation: Deferred | null;

export const fetchDashboard = createAsyncThunk(
  "metabase/dashboard/FETCH_DASHBOARD",
  async (
    {
      dashId,
      queryParams,
      options: { preserveParameters = false, clearCache = true } = {},
    }: {
      dashId: DashboardId;
      queryParams: Record<string, any>;
      options?: { preserveParameters?: boolean; clearCache?: boolean };
    },
    { getState, dispatch, rejectWithValue },
  ) => {
    if (fetchDashboardCancellation) {
      fetchDashboardCancellation.resolve();
    }
    fetchDashboardCancellation = defer();

    try {
      let entities;
      let result;
      const dashboardLoadId = uuid();

      const dashboardType = getDashboardType(dashId);
      const loadedDashboard = getDashboardById(getState(), dashId);

      if (!clearCache && loadedDashboard) {
        entities = {
          dashboard: { [dashId]: loadedDashboard },
          dashcard: Object.fromEntries(
            loadedDashboard.dashcards.map(id => [
              id,
              getDashCardById(getState(), id),
            ]),
          ),
        };
        result = denormalize(dashId, dashboard, entities);
      } else if (dashboardType === "public") {
        result = await PublicApi.dashboard(
          { uuid: dashId, dashboard_load_id: dashboardLoadId },
          { cancelled: fetchDashboardCancellation.promise },
        );
        result = {
          ...result,
          id: dashId,
          dashcards: result.dashcards.map((dc: DashboardCard) => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "embed") {
        result = await EmbedApi.dashboard(
          { token: dashId, dashboard_load_id: dashboardLoadId },
          { cancelled: fetchDashboardCancellation.promise },
        );
        result = {
          ...result,
          id: dashId,
          dashcards: result.dashcards.map((dc: DashboardCard) => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "transient") {
        const subPath = String(dashId).split("/").slice(3).join("/");
        const [entity, entityId] = subPath.split(/[/?]/);
        const [response] = await Promise.all([
          AutoApi.dashboard(
            { subPath, dashboard_load_id: dashboardLoadId },
            { cancelled: fetchDashboardCancellation.promise },
          ),
          dispatch(
            Dashboards.actions.fetchXrayMetadata({
              entity,
              entityId,
              dashboard_load_id: dashboardLoadId,
            }),
          ),
        ]);
        result = {
          ...response,
          id: dashId,
          dashcards: response.dashcards.map((dc: DashboardCard) => ({
            ...dc,
            dashboard_id: dashId,
          })),
        };
      } else if (dashboardType === "inline") {
        // HACK: this is horrible but the easiest way to get "inline" dashboards up and running
        // pass the dashboard in as dashboardId, and replace the id with [object Object] because
        // that's what it will be when cast to a string
        // Adding ESLint ignore because this is a hack and we should fix it.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        result = expandInlineDashboard(dashId);
        dashId = result.id = String(dashId);
      } else {
        const [response] = await Promise.all([
          DashboardApi.get(
            { dashId: dashId, dashboard_load_id: dashboardLoadId },
            { cancelled: fetchDashboardCancellation.promise },
          ),
          dispatch(
            Dashboards.actions.fetchMetadata({
              id: dashId,
              dashboard_load_id: dashboardLoadId,
            }),
          ),
        ]);
        result = response;
      }

      fetchDashboardCancellation = null;

      const isUsingCachedResults = entities != null;
      if (!isUsingCachedResults) {
        // copy over any virtual cards from the dashcard to the underlying card/question
        result.dashcards.forEach((card: DashboardCard) => {
          if (card.visualization_settings?.virtual_card) {
            card.card = Object.assign(
              card.card || {},
              card.visualization_settings.virtual_card,
            );
          }
        });
      }

      if (result.param_values) {
        await dispatch(addParamValues(result.param_values));
      }
      if (result.param_fields) {
        await dispatch(addFields(result.param_fields));
      }

      const lastUsedParametersValues = result["last_used_param_values"] ?? {};

      const parameterValuesById = preserveParameters
        ? getParameterValues(getState())
        : getParameterValuesByIdFromQueryParams(
            result.parameters ?? [],
            queryParams,
            lastUsedParametersValues,
          );

      entities = entities ?? normalize(result, dashboard).entities;

      return {
        entities,
        dashboard: result,
        dashboardId: result.id,
        parameterValues: parameterValuesById,
        preserveParameters,
      };
    } catch (error) {
      if (!(error as { isCancelled: boolean }).isCancelled) {
        console.error(error);
      }
      return rejectWithValue(error);
    }
  },
);
