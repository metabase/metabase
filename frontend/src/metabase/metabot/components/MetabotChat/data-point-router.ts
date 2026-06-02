import type { ClickObject } from "metabase-lib";
import type { Dataset } from "metabase-types/api";

import {
  type DataPointMentionId,
  type DataPointMentionTarget,
  getClickedObjectFromDataPointTarget,
  getFuzzyClickedObjectFromDataPointTarget,
} from "./data-point-mentions";

// A single mounted embedded question card that can resolve and highlight data
// point mentions against its own result.
export type DataPointCard = {
  id: string;
  // Monotonic mount order; higher means more recently mounted. Used to prefer
  // the freshest card when several can resolve the same point.
  mountedAt: number;
  getResult: () => Dataset | null;
  highlight: (clicked: ClickObject) => void;
  scrollIntoView: () => void;
  // Re-highlight a selection the user themselves created in this card (a single
  // cell or a range) when its mention id is clicked again. Returns true if it
  // handled the id.
  resolveMentionId?: (id: DataPointMentionId) => boolean;
};

export type OnDemandHandler = (
  target: DataPointMentionTarget,
  mentionId?: DataPointMentionId,
) => void;

// Module-level registry: every mounted card registers here regardless of which
// turn rendered it, so a mention can be routed to a card from an earlier turn —
// or, if none matches, to a freshly rendered "on demand" card.
const registry = new Map<string, DataPointCard>();
let mountCounter = 0;
let onDemandHandler: OnDemandHandler | null = null;

export const nextDataPointCardMountOrder = () => ++mountCounter;

export const registerDataPointCard = (card: DataPointCard): (() => void) => {
  registry.set(card.id, card);
  return () => {
    if (registry.get(card.id) === card) {
      registry.delete(card.id);
    }
  };
};

export const setDataPointOnDemandHandler = (
  handler: OnDemandHandler,
): (() => void) => {
  onDemandHandler = handler;
  return () => {
    if (onDemandHandler === handler) {
      onDemandHandler = null;
    }
  };
};

const cardsByRecency = () =>
  [...registry.values()].sort((a, b) => b.mountedAt - a.mountedAt);

// Route a data point mention to the best place to highlight it:
//  1. A mounted card that holds the exact row.
//  2. Otherwise the best-fitting mounted card (most shared columns, unique row).
//  3. Otherwise re-render the point's source question on demand (when known).
//  4. Otherwise the card that owns this mention id (a user's own selection).
// Returns true if the mention was handled.
export const routeDataPointMention = (
  target: DataPointMentionTarget | undefined,
  mentionId?: DataPointMentionId,
): boolean => {
  const cards = cardsByRecency();

  if (target) {
    for (const card of cards) {
      const clicked = getClickedObjectFromDataPointTarget(
        card.getResult(),
        target,
      );
      if (clicked) {
        card.scrollIntoView();
        card.highlight(clicked);
        return true;
      }
    }

    let best: {
      card: DataPointCard;
      clicked: ClickObject;
      score: number;
    } | null = null;
    for (const card of cards) {
      const fit = getFuzzyClickedObjectFromDataPointTarget(
        card.getResult(),
        target,
      );
      if (fit && (!best || fit.score > best.score)) {
        best = { card, clicked: fit.clicked, score: fit.score };
      }
    }
    if (best) {
      best.card.scrollIntoView();
      best.card.highlight(best.clicked);
      return true;
    }

    if (target.source?.question_url && onDemandHandler) {
      onDemandHandler(target, mentionId);
      return true;
    }
  }

  if (mentionId != null) {
    for (const card of cards) {
      if (card.resolveMentionId?.(mentionId)) {
        return true;
      }
    }
  }

  return false;
};
