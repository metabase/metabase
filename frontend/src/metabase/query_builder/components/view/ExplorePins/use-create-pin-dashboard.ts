import { useState } from "react";

import {
  useCreateCardMutation,
  useUpdateDashboardMutation,
} from "metabase/api";
import { getDashboard } from "metabase/api/dashboard";
import { useDispatch } from "metabase/redux";
import type { CardId, Dashboard, DashboardCard } from "metabase-types/api";

import type { ExplorePin } from "./pin-store";

const GRID_WIDTH = 24;
const CARD_WIDTH = 12;
const CARD_HEIGHT = 7;
const NUMBER_WIDTH = 6;
const NUMBER_HEIGHT = 3;

type CardLayout = Pick<DashboardCard, "col" | "row" | "size_x" | "size_y">;

/**
 * Lays pins out left to right, two charts per row; numbers take half the space,
 * so they line up in a strip.
 */
export function getPinLayouts(pins: readonly ExplorePin[]): CardLayout[] {
  let col = 0;
  let row = 0;
  let rowHeight = 0;
  return pins.map((pin) => {
    const isNumber = pin.display === "scalar";
    const size_x = isNumber ? NUMBER_WIDTH : CARD_WIDTH;
    const size_y = isNumber ? NUMBER_HEIGHT : CARD_HEIGHT;
    if (col + size_x > GRID_WIDTH) {
      col = 0;
      row += rowHeight;
      rowHeight = 0;
    }
    const layout = { col, row, size_x, size_y };
    col += size_x;
    rowHeight = Math.max(rowHeight, size_y);
    return layout;
  });
}

export type CreatePinDashboardResult = {
  savedCount: number;
  failedCount: number;
};

/** Saves each pin as a question on the dashboard, then lays them out in pin order. */
export function useCreatePinDashboard() {
  const dispatch = useDispatch();
  const [createCard] = useCreateCardMutation();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [isSaving, setIsSaving] = useState(false);

  const fetchDashboard = async (dashboard: Dashboard) => {
    const request = dispatch(
      getDashboard.initiate({ id: dashboard.id }, { forceRefetch: true }),
    );
    try {
      return await request.unwrap();
    } finally {
      request.unsubscribe();
    }
  };

  const create = async (
    dashboard: Dashboard,
    pins: readonly ExplorePin[],
  ): Promise<CreatePinDashboardResult> => {
    setIsSaving(true);
    try {
      const layoutsByCardId = new Map<CardId, CardLayout>();
      const layouts = getPinLayouts(pins);
      let failedCount = 0;
      // one at a time, because each new card is placed on the dashboard as it's created
      for (const [index, pin] of pins.entries()) {
        try {
          const card = await createCard({
            name: pin.name,
            dataset_query: pin.dataset_query,
            display: pin.display,
            visualization_settings: pin.visualization_settings,
            dashboard_id: dashboard.id,
            collection_id: dashboard.collection_id ?? null,
          }).unwrap();
          layoutsByCardId.set(card.id, layouts[index]);
        } catch {
          failedCount++;
        }
      }

      const savedDashboard = await fetchDashboard(dashboard);
      await updateDashboard({
        id: savedDashboard.id,
        dashcards: savedDashboard.dashcards.map((dashcard) => {
          const layout =
            dashcard.card_id != null
              ? layoutsByCardId.get(dashcard.card_id)
              : undefined;
          return layout ? { ...dashcard, ...layout } : dashcard;
        }),
        tabs: savedDashboard.tabs,
      }).unwrap();

      return { savedCount: layoutsByCardId.size, failedCount };
    } finally {
      setIsSaving(false);
    }
  };

  return { create, isSaving };
}
