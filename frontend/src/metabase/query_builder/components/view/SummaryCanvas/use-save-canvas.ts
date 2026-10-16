import { useState } from "react";
import { t } from "ttag";

import {
  useCreateCardMutation,
  useUpdateCardMutation,
  useUpdateDashboardMutation,
} from "metabase/api";
import { getDashboard } from "metabase/api/dashboard";
import { useDispatch } from "metabase/redux";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  DashboardId,
} from "metabase-types/api";

import { buildBlockQuery, getBlockQuestion, hasBlockContent } from "./blocks";
import type {
  SummaryBase,
  SummaryBlock,
  SummaryBlockLayout,
  SummaryCanvasDashboard,
} from "./types";

type SaveCanvasOptions = {
  dashboard: SummaryCanvasDashboard;
  dataQuestion: Question;
  base: SummaryBase;
  blocks: readonly SummaryBlock[];
  /** Cards of blocks removed since the last save, to take off the dashboard. */
  removedCardIds: readonly CardId[];
};

export type SaveCanvasResult =
  | {
      status: "saved";
      /** The card each saved block now points to, by block id. */
      cardIds: Map<string, CardId>;
      /** Blocks left as they were because they're empty or no longer resolve. */
      skippedCount: number;
      /** Blocks whose card couldn't be saved. */
      failedCount: number;
      /** Whether the dashboard's layout was updated to match the canvas. */
      isLayoutSaved: boolean;
    }
  | { status: "dashboard-missing" };

type CardFields = Pick<
  Card,
  "name" | "dataset_query" | "display" | "visualization_settings"
>;

function getCardFields(
  { dataQuestion, base }: SaveCanvasOptions,
  block: SummaryBlock,
): CardFields | null {
  const { query } = buildBlockQuery(base, block);
  if (query == null || !hasBlockContent(block)) {
    return null;
  }
  const blockQuestion = getBlockQuestion(dataQuestion, base, block, query);
  const card = blockQuestion.card();
  return {
    name: blockQuestion.displayName() ?? t`Summary`,
    dataset_query: card.dataset_query,
    display: card.display,
    visualization_settings: card.visualization_settings,
  };
}

function withLayout(
  dashcard: DashboardCard,
  layout: SummaryBlockLayout,
): DashboardCard {
  return {
    ...dashcard,
    col: layout.x,
    row: layout.y,
    size_x: layout.w,
    size_y: layout.h,
  };
}

/**
 * The dashboard's cards after a save: the canvas's cards laid out like the canvas,
 * removed blocks' cards dropped, and everything else on the dashboard untouched.
 */
export function getSavedDashcards(
  dashcards: readonly DashboardCard[],
  layoutsByCardId: ReadonlyMap<CardId, SummaryBlockLayout>,
  removedCardIds: readonly CardId[],
): DashboardCard[] {
  return dashcards.flatMap((dashcard) => {
    const cardId = dashcard.card_id;
    if (cardId == null) {
      return [dashcard];
    }
    if (removedCardIds.includes(cardId)) {
      return [];
    }
    const layout = layoutsByCardId.get(cardId);
    return [layout != null ? withLayout(dashcard, layout) : dashcard];
  });
}

/**
 * Saves the canvas to a dashboard as one card per block, owned by the dashboard
 * and laid out like the canvas. Blocks already saved update their card in place.
 * Blocks save independently, so one failure doesn't lose the others.
 */
export function useSaveSummaryCanvas() {
  const dispatch = useDispatch();
  const [createCard] = useCreateCardMutation();
  const [updateCard] = useUpdateCardMutation();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [isSaving, setIsSaving] = useState(false);

  const fetchDashboard = async (id: DashboardId): Promise<Dashboard | null> => {
    const request = dispatch(
      getDashboard.initiate({ id, ignore_error: true }, { forceRefetch: true }),
    );
    try {
      const dashboard = await request.unwrap();
      return dashboard.archived ? null : dashboard;
    } catch {
      return null;
    } finally {
      request.unsubscribe();
    }
  };

  const saveCard = async (
    dashboard: SummaryCanvasDashboard,
    block: SummaryBlock,
    fields: CardFields,
  ): Promise<CardId> => {
    if (block.cardId != null) {
      try {
        // un-archiving brings back a card a previous save took off the dashboard
        const card = await updateCard({
          id: block.cardId,
          ...fields,
          archived: false,
        }).unwrap();
        return card.id;
      } catch {
        // the card is gone, so save the block as a new one
      }
    }
    const card = await createCard({
      ...fields,
      dashboard_id: dashboard.id,
      collection_id: dashboard.collection_id ?? null,
    }).unwrap();
    return card.id;
  };

  const save = async (
    options: SaveCanvasOptions,
  ): Promise<SaveCanvasResult> => {
    setIsSaving(true);
    try {
      if ((await fetchDashboard(options.dashboard.id)) == null) {
        return { status: "dashboard-missing" };
      }

      const cardIds = new Map<string, CardId>();
      const layoutsByCardId = new Map<CardId, SummaryBlockLayout>();
      let skippedCount = 0;
      let failedCount = 0;
      // one at a time, because each new card is auto-placed on the dashboard
      for (const block of options.blocks) {
        const fields = getCardFields(options, block);
        if (fields == null) {
          skippedCount++;
          continue;
        }
        try {
          const cardId = await saveCard(options.dashboard, block, fields);
          cardIds.set(block.id, cardId);
          layoutsByCardId.set(cardId, block.layout);
        } catch {
          failedCount++;
        }
      }

      const dashboard = await fetchDashboard(options.dashboard.id);
      if (dashboard == null) {
        return {
          status: "saved",
          cardIds,
          skippedCount,
          failedCount,
          isLayoutSaved: false,
        };
      }
      const isLayoutSaved = await updateDashboard({
        id: dashboard.id,
        dashcards: getSavedDashcards(
          dashboard.dashcards,
          layoutsByCardId,
          options.removedCardIds,
        ),
        tabs: dashboard.tabs,
      })
        .unwrap()
        .then(
          () => true,
          () => false,
        );

      return {
        status: "saved",
        cardIds,
        skippedCount,
        failedCount,
        isLayoutSaved,
      };
    } finally {
      setIsSaving(false);
    }
  };

  return { save, isSaving };
}
