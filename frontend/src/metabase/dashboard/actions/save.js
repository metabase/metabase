import { assocIn, dissocIn, getIn } from "icepick";
import _ from "underscore";

import { createThunkAction } from "metabase/lib/redux";

import Dashboards from "metabase/entities/dashboards";

import { DashboardApi, CardApi } from "metabase/services";
import { clickBehaviorIsValid } from "metabase-lib/parameters/utils/click-behavior";

import { getDashboardBeforeEditing } from "../selectors";

import { updateDashcardIds } from "./core";
import { fetchDashboard } from "./data-fetching";
import { hasDashboardChanged, haveDashboardCardsChanged } from "./utils";

export const SAVE_DASHBOARD_AND_CARDS =
  "metabase/dashboard/SAVE_DASHBOARD_AND_CARDS";

export const saveDashboardAndCards = createThunkAction(
  SAVE_DASHBOARD_AND_CARDS,
  function (preserveParameters = false) {
    return async function (dispatch, getState) {
      const state = getState();
      const { dashboards, dashcards, dashboardId } = state.dashboard;
      const dashboard = {
        ...dashboards[dashboardId],
        ordered_cards: dashboards[dashboardId].ordered_cards.map(
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
          dashboard.ordered_cards,
          dashboardBeforeEditing.ordered_cards,
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
      dashboard.ordered_cards = dashboard.ordered_cards.map((card, index) => {
        if (!clickBehaviorIsValid(getIn(card, clickBehaviorPath))) {
          const startingValue = getIn(dashboardBeforeEditing, [
            "ordered_cards",
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
      dashboard.ordered_cards = dashboard.ordered_cards.map(dc => ({
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
        dashboard.ordered_cards
          .filter(dc => dc.card.isDirty)
          .map(async dc => CardApi.update(dc.card)),
      );

      // update the dashboard itself
      if (dashboard.isDirty) {
        const { id, name, description, parameters } = dashboard;
        await dispatch(
          Dashboards.actions.update({ id }, { name, description, parameters }),
        );
      }

      // update the dashboard cards
      const dashcardsToUpdate = dashboard.ordered_cards.filter(
        dc => !dc.isRemoved,
      );
      const updatedDashCards = await DashboardApi.updateCards({
        dashId: dashboard.id,
        cards: dashcardsToUpdate.map(dc => ({
          id: dc.id,
          card_id: dc.card_id,
          action_id: dc.action_id,
          row: dc.row,
          col: dc.col,
          size_x: dc.size_x,
          size_y: dc.size_y,
          series: dc.series,
          visualization_settings: dc.visualization_settings,
          parameter_mappings: dc.parameter_mappings,
        })),
      });
      dispatch(
        updateDashcardIds(
          dashcardsToUpdate.map(dc => dc.id),
          updatedDashCards.map(dc => dc.id),
        ),
      );

      await dispatch(Dashboards.actions.update(dashboard));

      // make sure that we've fully cleared out any dirty state from editing (this is overkill, but simple)
      dispatch(fetchDashboard(dashboard.id, null, preserveParameters)); // disable using query parameters when saving
    };
  },
);
