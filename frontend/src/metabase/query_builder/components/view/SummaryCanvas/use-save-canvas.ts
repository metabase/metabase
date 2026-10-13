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
import type { CardId, DashboardCard } from "metabase-types/api";

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
};

export type SaveCanvasResult = {
  /** The card each saved block now points to, by block id. */
  cardIds: Map<string, CardId>;
  /** Blocks left out because they're empty or no longer resolve. */
  skippedCount: number;
};

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
 * Saves the canvas to a dashboard as one card per block, owned by the dashboard
 * and laid out like the canvas. Blocks already saved update their card in place;
 * cards whose block was removed are taken off the dashboard.
 */
export function useSaveSummaryCanvas() {
  const dispatch = useDispatch();
  const [createCard] = useCreateCardMutation();
  const [updateCard] = useUpdateCardMutation();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [isSaving, setIsSaving] = useState(false);

  const saveBlock = async (
    { dashboard, dataQuestion, base }: SaveCanvasOptions,
    block: SummaryBlock,
  ): Promise<CardId | null> => {
    const { query } = buildBlockQuery(base, block);
    if (query == null || !hasBlockContent(block)) {
      return null;
    }
    const blockQuestion = getBlockQuestion(dataQuestion, base, block, query);
    const card = blockQuestion.card();
    const cardFields = {
      name: blockQuestion.displayName() ?? t`Summary`,
      dataset_query: card.dataset_query,
      display: card.display,
      visualization_settings: card.visualization_settings,
    };
    const savedCard =
      block.cardId != null
        ? await updateCard({ id: block.cardId, ...cardFields }).unwrap()
        : await createCard({
            ...cardFields,
            dashboard_id: dashboard.id,
            collection_id: dashboard.collection_id ?? null,
          }).unwrap();
    return savedCard.id;
  };

  const save = async (
    options: SaveCanvasOptions,
  ): Promise<SaveCanvasResult> => {
    setIsSaving(true);
    try {
      const cardIds = new Map<string, CardId>();
      const layoutsByCardId = new Map<CardId, SummaryBlockLayout>();
      // one at a time, because each new card is auto-placed on the dashboard
      for (const block of options.blocks) {
        const cardId = await saveBlock(options, block);
        if (cardId != null) {
          cardIds.set(block.id, cardId);
          layoutsByCardId.set(cardId, block.layout);
        }
      }

      const request = dispatch(
        getDashboard.initiate(
          { id: options.dashboard.id },
          { forceRefetch: true },
        ),
      );
      try {
        const dashboard = await request.unwrap();
        const dashcards = dashboard.dashcards.flatMap((dashcard) => {
          const layout =
            dashcard.card_id != null
              ? layoutsByCardId.get(dashcard.card_id)
              : undefined;
          return layout != null ? [withLayout(dashcard, layout)] : [];
        });
        await updateDashboard({ id: dashboard.id, dashcards }).unwrap();
      } finally {
        request.unsubscribe();
      }

      return {
        cardIds,
        skippedCount: options.blocks.length - cardIds.size,
      };
    } finally {
      setIsSaving(false);
    }
  };

  return { save, isSaving };
}
