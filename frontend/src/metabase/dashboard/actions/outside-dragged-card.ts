import { createAction } from "@reduxjs/toolkit";
import { DEFAULT_CARD_SIZE } from "metabase/lib/dashboard_grid";
import { getVisualizationRaw } from "metabase/visualizations";
import type { Card } from "metabase-types/api";

export const setOutsideDraggedCard = createAction(
  "metabase/dashboard/SET_OUTSIDE_DRAGGED_CARD",
  (card: Card | null) => {
    if (!card) {
      return { payload: null };
    }

    const visualization = getVisualizationRaw([{ card }]);
    const size = visualization?.defaultSize || DEFAULT_CARD_SIZE;

    return {
      payload: {
        cardId: card.id,

        // For react-grid-layout
        i: String(card.id),
        w: size.width,
        h: size.height,
      },
    };
  },
);
