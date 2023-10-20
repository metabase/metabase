import { assocIn, dissocIn, getIn } from "icepick";
import _ from "underscore";

import { createThunkAction } from "metabase/lib/redux";

import Dashboards from "metabase/entities/dashboards";

import { DashboardApi, CardApi } from "metabase/services";
import { clickBehaviorIsValid } from "metabase-lib/parameters/utils/click-behavior";

import { getDashboardBeforeEditing } from "../selectors";

import { fetchDashboard } from "./data-fetching";
import { hasDashboardChanged, haveDashboardCardsChanged } from "./utils";
import { saveCardsAndTabs } from "./tabs";

export const UPDATE_DASHBOARD_AND_CARDS =
  "metabase/dashboard/UPDATE_DASHBOARD_AND_CARDS";

export const UPDATE_DASHBOARD = "metabase/dashboard/UPDATE_DASHBOARD";

export const updateDashboardAndCards = createThunkAction(
  UPDATE_DASHBOARD_AND_CARDS,
  function () {
    return async function (dispatch, getState) {
      const state = getState();
      const { dashboards, dashcards, dashboardId } = state.dashboard;
      const dashboard = {
        ...dashboards[dashboardId],
        dashcards: dashboards[dashboardId].dashcards.map(
          dashcardId => dashcards[dashcardId],
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
      dashboard.dashcards = dashboard.dashcards.map(dc => ({
        ...dc,
        parameter_mappings: dc.parameter_mappings.filter(
          mapping =>
            // filter out mappings for deleted parameters
            _.findWhere(dashboard.parameters, {
              id: mapping.parameter_id,
            }) &&
            // filter out mappings for deleted series
            (!dc.card_id ||
              dc.action ||
              dc.card_id === mapping.card_id ||
              _.findWhere(dc.series, { id: mapping.card_id })),
        ),
      }));

      // update modified cards
      await Promise.all(
        dashboard.dashcards
          .filter(dc => dc.card.isDirty)
          .map(async dc => CardApi.update(dc.card)),
      );

      const dashcardsToUpdate = dashboard.dashcards.filter(dc => !dc.isRemoved);
      const updateCardsAndTabs = DashboardApi.updateCardsAndTabs({
        dashId: dashboard.id,
        cards: dashcardsToUpdate.map(dc => ({
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
          parameter_mappings: dc.parameter_mappings,
        })),
        tabs: (dashboard.tabs ?? [])
          .filter(tab => !tab.isRemoved)
          .map(({ id, name }) => ({
            id,
            name,
          })),
      });

      updateCardsAndTabs.then(updatedCardsAndTabs => {
        dispatch(saveCardsAndTabs(updatedCardsAndTabs));
      });

      // Make two parallel requests: one to update the dashboard and another for the dashcards and tabs
      await Promise.all([
        updateCardsAndTabs,
        dispatch(Dashboards.actions.update(dashboard)),
      ]);

      // make sure that we've fully cleared out any dirty state from editing (this is overkill, but simple)
      dispatch(
        fetchDashboard(dashboard.id, null, { preserveParameters: false }),
      ); // disable using query parameters when saving
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
        fetchDashboard(dashboard.id, null, { preserveParameters: true }),
      );
    };
  },
);
