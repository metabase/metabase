import { assocIn, dissocIn, getIn } from "icepick";
import _ from "underscore";

// Import directly from data-fetching to avoid circular dependency through actions/index
import {
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions/data-fetching";
import { Dashboards } from "metabase/entities/dashboards";
import { createThunkAction } from "metabase/lib/redux";
import { CardApi } from "metabase/services";
import { clickBehaviorIsValid } from "metabase-lib/v1/parameters/utils/click-behavior";

import { trackDashboardSaved } from "../analytics";
import { getDashboardBeforeEditing } from "../selectors";
import { getInlineParameterTabMap } from "../utils";

import { setEditingDashboard } from "./core";
import {
  hasDashboardChanged,
  haveDashboardCardsChanged,
  trackAddedIFrameDashcards,
} from "./utils";

export const UPDATE_DASHBOARD_AND_CARDS =
  "metabase/dashboard/UPDATE_DASHBOARD_AND_CARDS";

export const UPDATE_DASHBOARD = "metabase/dashboard/UPDATE_DASHBOARD";

export const updateDashboardAndCards = createThunkAction(
  UPDATE_DASHBOARD_AND_CARDS,
  function () {
    return async function (dispatch, getState) {
      const startTime = performance.now();
      const state = getState();
      const { dashboards, dashcards, dashboardId } = state.dashboard;
      const dashboard = {
        ...dashboards[dashboardId],
        dashcards: dashboards[dashboardId].dashcards.map(
          (dashcardId) => dashcards[dashcardId],
        ),
      };

      const dashboardBeforeEditing = getDashboardBeforeEditing(state);

      if (dashboardBeforeEditing) {
        const dashboardHasChanged = hasDashboardChanged(
          dashboard,
          dashboardBeforeEditing,
        );

        const cardsHaveChanged = haveDashboardCardsChanged(
          dashboard.dashcards,
          dashboardBeforeEditing.dashcards,
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
          const startingValue = getIn(dashboardBeforeEditing, [
            "dashcards",
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
      const inlineParameterIds = Object.keys(inlineParameterTabMap);
      dashboard.dashcards = dashboard.dashcards.map((dc) => ({
        ...dc,
        parameter_mappings: dc.parameter_mappings.filter((mapping) => {
          const isRemoved = !(dashboard.parameters ?? []).some(
            (parameter) => parameter.id === mapping.parameter_id,
          );
          if (isRemoved) {
            return false;
          }

          const isInlineParameter = inlineParameterIds.includes(
            mapping.parameter_id,
          );
          const isOwnInlineParameter = (dc.inline_parameters ?? []).includes(
            mapping.parameter_id,
          );
          if (
            isInlineParameter &&
            !isOwnInlineParameter &&
            (dashboard.tabs ?? []).length > 1
          ) {
            const parameterTabId = inlineParameterTabMap[mapping.parameter_id];
            return parameterTabId === dc.dashboard_tab_id;
          }

          // filter out mappings for deleted series
          return (
            !dc.card_id ||
            dc.action ||
            dc.card_id === mapping.card_id ||
            _.findWhere(dc.series, { id: mapping.card_id })
          );
        }),
      }));

      // update modified cards
      await Promise.all(
        dashboard.dashcards
          .filter((dc) => dc.card.isDirty)
          .map(async (dc) => CardApi.update(dc.card)),
      );

      trackAddedIFrameDashcards(dashboard);

      const dashcardsToUpdate = dashboard.dashcards
        .filter((dc) => !dc.isRemoved)
        .map((dc) => ({
          id: dc.id,
          card_id: dc.card_id,
          dashboard_tab_id: dc.dashboard_tab_id,
          action_id: dc.action_id,
          row: dc.row,
          col: dc.col,
          size_x: dc.size_x,
          size_y: dc.size_y,
          series: dc.series,
          visualization_settings: dc.visualization_settings,
          inline_parameters: dc.inline_parameters,
          parameter_mappings: dc.parameter_mappings,
        }));
      const tabsToUpdate = (dashboard.tabs ?? [])
        .filter((tab) => !tab.isRemoved)
        .map(({ id, name }) => ({
          id,
          name,
        }));
      await dispatch(
        Dashboards.actions.update({
          ...dashboard,
          dashcards: dashcardsToUpdate,
          tabs: tabsToUpdate,
        }),
      );

      const endTime = performance.now();
      const duration_milliseconds = parseInt(endTime - startTime);
      trackDashboardSaved({
        dashboard_id: dashboard.id,
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
          queryParams: null,
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
  function ({ attributeNames }) {
    return async function (dispatch, getState) {
      const state = getState();
      const { dashboards, dashboardId } = state.dashboard;
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
          queryParam: null,
          options: { preserveParameters: true },
        }),
      );
    };
  },
);
