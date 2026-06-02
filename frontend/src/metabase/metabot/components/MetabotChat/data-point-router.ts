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
  // Normalized identity of this card's question (see `normalizeQuestionLink`),
  // used to match a chart link in the reply text back to this embedded chart.
  questionKey?: string;
  // The card's displayed title; used as a fallback match when a chart link's
  // identity differs from this card's (e.g. a saved-question id vs. an adhoc
  // hash) but its label is the chart name.
  questionName?: string;
  // Briefly pulse this card to draw attention after scrolling it into view.
  flash?: () => void;
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

// The hash of an adhoc question url (`/question#<hash>`), tolerant of an
// absolute url prefix (the agent sometimes links the full site url).
const QUESTION_HASH_RE = /\/question#([^\s?#]+)/;
// A saved question id, whether linked as a route (`/question/<id>`) or via the
// metabase protocol (`metabase://question/<id>`).
const QUESTION_ROUTE_ID_RE = /\/question\/(\d+)/;
const QUESTION_PROTOCOL_ID_RE = /metabase:\/\/question\/(\d+)/;

// Reduce a link (or an embedded card's path) to a stable identity so a chart
// link in the reply text can be matched back to the chart it embeds. Returns
// `undefined` for links that don't reference a question.
export const normalizeQuestionLink = (
  href: string | undefined,
): string | undefined => {
  if (!href) {
    return undefined;
  }
  const hash = href.match(QUESTION_HASH_RE);
  if (hash) {
    return `hash:${hash[1]}`;
  }
  const id =
    href.match(QUESTION_ROUTE_ID_RE) ?? href.match(QUESTION_PROTOCOL_ID_RE);
  if (id) {
    return `id:${id[1]}`;
  }
  return undefined;
};

// Whether a link points at a question at all — used to gate the title-based
// fallback match so we never hijack an unrelated link that happens to share its
// label with an embedded chart.
export const isQuestionLikeHref = (href: string | undefined): boolean =>
  !!href &&
  (/\/question(?:[/#?]|$)/.test(href) || /metabase:\/\/question\//.test(href));

const normalizeChartTitle = (title: string | undefined): string =>
  (title ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// Find the embedded chart, if any, that a reply-text link refers to: first by
// question identity, then (for question links whose identity differs from the
// embed's) by matching the link's label against a chart's title. Prefers the
// most recently mounted card when several match.
export const resolveChartCardForLink = (
  href: string | undefined,
  linkText: string | undefined,
): DataPointCard | undefined => {
  const cards = cardsByRecency();

  const key = normalizeQuestionLink(href);
  if (key) {
    const byKey = cards.find((card) => card.questionKey === key);
    if (byKey) {
      return byKey;
    }
  }

  if (isQuestionLikeHref(href)) {
    const title = normalizeChartTitle(linkText);
    if (title) {
      const byTitle = cards.find(
        (card) => normalizeChartTitle(card.questionName) === title,
      );
      if (byTitle) {
        return byTitle;
      }
    }
  }

  return undefined;
};
