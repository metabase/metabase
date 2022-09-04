import { assocIn, dissocIn, getIn } from "icepick";
import _ from "underscore";

import { createThunkAction } from "metabase/lib/redux";

import Dashboards from "metabase/entities/dashboards";

import { clickBehaviorIsValid } from "metabase/lib/click-behavior";

import { DashboardApi, CardApi } from "metabase/services";

import { getDashboardBeforeEditing } from "../selectors";

import { updateDashcardId } from "./core";
import { fetchDashboard } from "./data-fetching";

export const SAVE_DASHBOARD_AND_CARDS =
  "metabase/dashboard/SAVE_DASHBOARD_AND_CARDS";

export const saveDashboardAndCards = createThunkAction(
  SAVE_DASHBOARD_AND_CARDS,
  function () {
    return async function (dispatch, getState) {
      const state = getState();
      const { dashboards, dashcards, dashboardId } = state.dashboard;
      const dashboard = {
        ...dashboards[dashboardId],
        ordered_cards: dashboards[dashboardId].ordered_cards.map(
          dashcardId => dashcards[dashcardId],
        ),
      };

      // clean invalid dashcards
      // We currently only do this for dashcard click behavior.
      // Invalid (partially complete) states are fine during editing,
      // but we should restore the previous value if saved while invalid.
      const dashboardBeforeEditing = getDashboardBeforeEditing(state);
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

      // remove isRemoved dashboards
      await Promise.all(
        dashboard.ordered_cards
          .filter(dc => dc.isRemoved && !dc.isAdded)
          .map(dc =>
            DashboardApi.removecard({
              dashId: dashboard.id,
              dashcardId: dc.id,
            }),
          ),
      );

      // add isAdded dashboards
      const updatedDashcards = await Promise.all(
        dashboard.ordered_cards
          .filter(dc => !dc.isRemoved)
          .map(async dc => {
            if (dc.isAdded) {
              const result = await DashboardApi.addcard({
                dashId: dashboard.id,
                cardId: dc.card_id,
              });
              dispatch(updateDashcardId(dc.id, result.id));

              // mark isAdded because addcard doesn't record the position
              return {
                ...result,
                col: dc.col,
                row: dc.row,
                sizeX: dc.sizeX,
                sizeY: dc.sizeY,
                series: dc.series,
                parameter_mappings: dc.parameter_mappings,
                visualization_settings: dc.visualization_settings,
                isAdded: true,
              };
            } else {
              return dc;
            }
          }),
      );

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

      // reposition the cards
      if (_.some(updatedDashcards, dc => dc.isDirty || dc.isAdded)) {
        const cards = updatedDashcards.map(
          ({
            id,
            action_id,
            card_id,
            row,
            col,
            sizeX,
            sizeY,
            series,
            parameter_mappings,
            visualization_settings,
          }) => ({
            id,
            action_id,
            card_id,
            row,
            col,
            sizeX,
            sizeY,
            series,
            visualization_settings,
            parameter_mappings:
              parameter_mappings &&
              parameter_mappings.filter(
                mapping =>
                  // filter out mappings for deleted parameters
                  _.findWhere(dashboard.parameters, {
                    id: mapping.parameter_id,
                  }) &&
                  // filter out mappings for deleted series
                  (!card_id ||
                    card_id === mapping.card_id ||
                    _.findWhere(series, { id: mapping.card_id })),
              ),
          }),
        );

        const result = await DashboardApi.reposition_cards({
          dashId: dashboard.id,
          cards,
        });
        if (result.status !== "ok") {
          throw new Error(result.status);
        }
      }

      await dispatch(Dashboards.actions.update(dashboard));

      // make sure that we've fully cleared out any dirty state from editing (this is overkill, but simple)
      dispatch(fetchDashboard(dashboard.id, null)); // disable using query parameters when saving
    };
  },
);
