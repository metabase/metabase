import { assocIn, dissocIn, getIn } from "icepick";
import _ from "underscore";

import { Dashboards } from "metabase/entities/dashboards";
import { createThunkAction } from "metabase/lib/redux";
import { CardApi } from "metabase/services";
import { clickBehaviorIsValid } from "metabase-lib/v1/parameters/utils/click-behavior";
import type { DashCardId, ParameterId } from "metabase-types/api";
import type {
  Dispatch,
  GetState,
  StoreDashboard,
  StoreDashcard,
} from "metabase-types/store";

import { trackDashboardSaved } from "../analytics";
import { getDashboardBeforeEditing } from "../selectors";
import { getInlineParameterTabMap } from "../utils";

import { setEditingDashboard } from "./core";
import { fetchDashboard, fetchDashboardCardData } from "./data-fetching";
import { trackAddedIFrameDashcards } from "./utils";

export const UPDATE_DASHBOARD_AND_CARDS =
  "metabase/dashboard/UPDATE_DASHBOARD_AND_CARDS";

export const UPDATE_DASHBOARD = "metabase/dashboard/UPDATE_DASHBOARD";

export const updateDashboardAndCards = createThunkAction(
  UPDATE_DASHBOARD_AND_CARDS,
  function () {
    return async function (dispatch: Dispatch, getState: GetState) {
      const startTime = performance.now();
      const state = getState();
      const { dashboards, dashcards, dashboardId } = state.dashboard;

      if (dashboardId == null) {
        return;
      }

      const storeDashboard = dashboards[dashboardId];
      if (!storeDashboard) {
        return;
      }

      const dashboard: Omit<StoreDashboard, "dashcards"> & {
        dashcards: StoreDashcard[];
      } = {
        ...storeDashboard,
        dashcards: storeDashboard.dashcards
          .map((dashcardId: DashCardId) => dashcards[dashcardId])
          .filter((dashcard): dashcard is StoreDashcard => dashcard != null),
      };

      const dashboardBeforeEditing = getDashboardBeforeEditing(state);

      if (dashboardBeforeEditing) {
        const dashboardHasChanged = !_.isEqual(
          { ...dashboard, dashcards: dashboard.dashcards.length },
          {
            ...dashboardBeforeEditing,
            dashcards: dashboardBeforeEditing.dashcards.length,
          },
        );

        const cardsHaveChanged =
          dashboard.dashcards.length !==
            dashboardBeforeEditing.dashcards.length ||
          !dashboard.dashcards.every((newCard) =>
            dashboardBeforeEditing.dashcards.some((oldCard) =>
              _.isEqual(oldCard, newCard),
            ),
          );

        if (!cardsHaveChanged && !dashboardHasChanged) {
          return;
        }
      }

      // clean invalid dashcards
      // We currently only do this for dashcard click behavior.
      // Invalid (partially complete) states are fine during editing,
      // but we should restore the previous value if saved while invalid.
      const clickBehaviorPath = ["visualization_settings", "click_behavior"];
      dashboard.dashcards = dashboard.dashcards.map((card, index) => {
        if (!clickBehaviorIsValid(getIn(card, clickBehaviorPath))) {
          const startingValue = getIn(dashboardBeforeEditing?.dashcards ?? [], [
            index,
            ...clickBehaviorPath,
          ]);
          return startingValue == null
            ? dissocIn(card, clickBehaviorPath)
            : assocIn(card, clickBehaviorPath, startingValue);
        }
        return card;
      });

      // update parameter mappings
      const inlineParameterTabMap = getInlineParameterTabMap(dashboard);
      const inlineParameterIds = Object.keys(
        inlineParameterTabMap,
      ) as ParameterId[];

      dashboard.dashcards.forEach((dc) => {
        const hasParameter = (parameterId: ParameterId) =>
          (dashboard.parameters ?? []).some(
            (parameter) => parameter.id === parameterId,
          );
        const shouldKeepInlineMapping = (parameterId: ParameterId) => {
          const isInlineParameter = inlineParameterIds.includes(parameterId);
          const isOwnInlineParameter =
            "inline_parameters" in dc
              ? (dc.inline_parameters ?? []).includes(parameterId)
              : false;

          if (
            isInlineParameter &&
            !isOwnInlineParameter &&
            (dashboard.tabs ?? []).length > 1
          ) {
            const parameterTabId = inlineParameterTabMap[parameterId];
            return parameterTabId === dc.dashboard_tab_id;
          }
          return true;
        };

        const parameter_mappings = (dc.parameter_mappings ?? []).filter(
          (mapping) => {
            if (!hasParameter(mapping.parameter_id)) {
              return false;
            }
            if (!shouldKeepInlineMapping(mapping.parameter_id)) {
              return false;
            }

            // filter out mappings for deleted series
            if ("action_id" in dc || !dc.card_id || !("card_id" in mapping)) {
              return true;
            }

            const mappedCardId =
              typeof mapping.card_id === "number" ? mapping.card_id : null;
            if (mappedCardId == null) {
              return false;
            }

            return (
              dc.card_id === mappedCardId ||
              _.findWhere(dc.series ?? [], { id: mappedCardId })
            );
          },
        );
        dc.parameter_mappings = parameter_mappings;
      });

      // update modified cards
      await Promise.all(
        dashboard.dashcards
          .filter((dc) => "isDirty" in dc.card && Boolean(dc.card.isDirty))
          .map(async (dc) => CardApi.update(dc.card)),
      );

      trackAddedIFrameDashcards(dashboard);

      const dashcardsToUpdate = dashboard.dashcards
        .filter((dc) => !dc.isRemoved)
        .map((dc) => {
          const baseDashcard = {
            id: dc.id,
            card_id: dc.card_id,
            dashboard_tab_id: dc.dashboard_tab_id,
            row: dc.row,
            col: dc.col,
            size_x: dc.size_x,
            size_y: dc.size_y,
            visualization_settings: dc.visualization_settings,
            parameter_mappings: dc.parameter_mappings,
          };

          return {
            ...baseDashcard,
            ...("action_id" in dc ? { action_id: dc.action_id } : null),
            ...("series" in dc ? { series: dc.series } : null),
            ...("inline_parameters" in dc
              ? { inline_parameters: dc.inline_parameters }
              : null),
          };
        });

      const tabsToUpdate = (dashboard.tabs ?? [])
        .filter((tab) => !tab.isRemoved)
        .map(({ id, name }) => ({ id, name }));

      await dispatch(
        Dashboards.actions.update({
          ...dashboard,
          dashcards: dashcardsToUpdate,
          tabs: tabsToUpdate,
        }),
      );

      const endTime = performance.now();
      const duration_milliseconds = Math.trunc(endTime - startTime);
      trackDashboardSaved({
        dashboard_id: typeof dashboard.id === "number" ? dashboard.id : 0,
        duration_milliseconds,
      });

      dispatch(setEditingDashboard(null));

      // make sure that we've fully cleared out any dirty state from editing (this is overkill, but simple)
      //
      // UPD 16.09.2024
      // This code is a source of race condition on slow network.
      // it fetches a dashboard without parameters and if `fetchDashboardCardData` from the lines below is slow
      // the dashboard itself is re-rendered and re-fetches data again without parameters, so later on
      // dashboard component re-fetches data and cancels correct query with parameters
      // e.g. `should pass a temporal unit with 'update dashboard filter' click behavior` from temporal-unit-parameters.cy.spec.js
      // with 3g simulation is an example of such race condition
      await dispatch(
        fetchDashboard({
          dashId: dashboard.id,
          queryParams: {},
          options: { preserveParameters: false },
        }),
      ); // disable using query parameters when saving

      // There might have been changes to dashboard card-filter wiring,
      // which require re-fetching card data (issue #35503). We expect
      // the fetchDashboardCardData to decide which cards to fetch.
      dispatch(
        fetchDashboardCardData({
          reload: false,
          clearCache: false,
        }),
      );
    };
  },
);

export const updateDashboard = createThunkAction(
  UPDATE_DASHBOARD,
  function ({ attributeNames }: { attributeNames: string[] }) {
    return async function (dispatch: Dispatch, getState: GetState) {
      const state = getState();
      const { dashboards, dashboardId } = state.dashboard;

      if (dashboardId == null) {
        return;
      }

      const dashboard = dashboards[dashboardId];

      if (!dashboard) {
        console.warn(`no dashboard with id ${dashboardId} were found`);
        return;
      }

      if (attributeNames.length > 0) {
        const attributes = _.pick(dashboard, attributeNames);

        await dispatch(
          Dashboards.actions.update({ id: dashboardId }, attributes),
        );
      }

      // make sure that we've fully cleared out any dirty state from editing (this is overkill, but simple)
      dispatch(
        fetchDashboard({
          dashId: dashboard.id,
          queryParams: {},
          options: { preserveParameters: true },
        }),
      );
    };
  },
);
