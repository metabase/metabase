import { t } from "ttag";

import { humanize } from "metabase/utils/formatting/strings";

/*
 * Guesses a starting funnel from what's in the event table, so a new funnel
 * isn't blank. Nothing here runs a query: it only reads names the table
 * already knows (its segments and the distinct values of its event name and
 * URL path columns) and ranks them against the stages of a classic
 * acquisition funnel: landing → signup → activation → purchase.
 */

export type StepSource = "segment" | "event_name" | "url_path";

export type StepCandidate = {
  source: StepSource;
  /** The segment name, event name or URL path, as stored. */
  value: string;
};

export type SuggestedStep = StepCandidate & {
  /** The step's label in the funnel. */
  name: string;
};

type Stage = {
  /** Most typical first. Matched as a whole word or a word sequence. */
  events: string[];
  /** Matched against the path's segments. Most typical first. */
  paths: string[];
};

const STAGES: readonly Stage[] = [
  {
    // Landing: where the journey starts. Pricing before the homepage, since a
    // pricing visit says more about intent than any visit.
    events: ["page view", "pageview", "visit", "landing", "pricing viewed"],
    paths: ["pricing", "/", "home", "landing", "plans", "product", "features"],
  },
  {
    events: [
      "signup",
      "sign up",
      "signed up",
      "register",
      "registered",
      "registration",
      "account created",
      "user created",
      "joined",
    ],
    paths: ["signup", "sign up", "register", "join", "get started", "start"],
  },
  {
    events: [
      "trial started",
      "trial",
      "onboarding completed",
      "onboarding",
      "activated",
      "activation",
      "project created",
      "workspace created",
      "first",
      "logged in",
      "login",
      "active",
    ],
    paths: ["onboarding", "welcome", "getting started", "app", "dashboard"],
  },
  {
    events: [
      "checkout completed",
      "purchase",
      "purchased",
      "order completed",
      "order placed",
      "payment",
      "paid",
      "subscribed",
      "subscription started",
      "upgraded",
      "upgrade",
      "converted",
      "checkout",
      "paying",
      "customers",
      "subscribers",
    ],
    paths: [
      "checkout",
      "purchase",
      "subscribe",
      "upgrade",
      "thank you",
      "thanks",
      "success",
      "order",
      "billing",
    ],
  },
];

/** Steps nobody wants in a conversion funnel. */
const EXCLUDED_WORDS = [
  "cancel",
  "cancelled",
  "canceled",
  "fail",
  "failed",
  "error",
  "delete",
  "deleted",
  "churn",
  "churned",
  "refund",
  "refunded",
  "unsubscribe",
  "unsubscribed",
];

const MAX_STEPS = 3;
const MIN_STEPS = 2;

/** Segments beat event names beat paths: a segment is something a person curated. */
const SOURCE_PRIORITY: Record<StepSource, number> = {
  segment: 0,
  event_name: 1,
  url_path: 2,
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== "");

const includesSequence = (tokens: string[], sequence: string[]): boolean =>
  tokens.some((_token, start) =>
    sequence.every((word, offset) => tokens[start + offset] === word),
  );

/** The index of the first keyword the value matches, or -1. */
const matchRank = (tokens: string[], keywords: string[]): number =>
  keywords.findIndex((keyword) =>
    keyword === "/"
      ? tokens.length === 0
      : includesSequence(tokens, tokenize(keyword)),
  );

const isExcluded = (tokens: string[]): boolean =>
  tokens.some((token) => EXCLUDED_WORDS.includes(token));

type RankedCandidate = StepCandidate & { stage: number; rank: number };

/**
 * The stage whose keyword the value matches best. A later stage wins a tie,
 * so "/app/checkout" is a purchase, not a visit to the app.
 */
const rankCandidate = (candidate: StepCandidate): RankedCandidate | null => {
  const tokens = tokenize(candidate.value);
  if (isExcluded(tokens)) {
    return null;
  }
  const matches = STAGES.flatMap(({ events, paths }, stage) => {
    // A segment is named by a person, so it may read like either.
    const keywordLists =
      candidate.source === "url_path"
        ? [paths]
        : candidate.source === "segment"
          ? [events, paths]
          : [events];
    const ranks = keywordLists
      .map((keywords) => matchRank(tokens, keywords))
      .filter((rank) => rank !== -1);
    return ranks.length > 0 ? [{ stage, rank: Math.min(...ranks) }] : [];
  });
  const best = matches.sort((a, b) => a.rank - b.rank || b.stage - a.stage)[0];
  return best ? { ...candidate, ...best } : null;
};

const compareCandidates = (a: RankedCandidate, b: RankedCandidate): number =>
  SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source] || a.rank - b.rank;

/** Keeps the first and last stage, and the earliest of the rest. */
const pickStages = <T>(byStage: T[]): T[] => {
  if (byStage.length <= MAX_STEPS) {
    return byStage;
  }
  const first = byStage[0];
  const last = byStage[byStage.length - 1];
  const middle = byStage.slice(1, -1).slice(0, MAX_STEPS - 2);
  return [first, ...middle, last];
};

export const getStepName = ({ source, value }: StepCandidate): string => {
  switch (source) {
    case "segment":
      return value;
    case "event_name":
      return humanize(value);
    case "url_path":
      return value === "/" ? t`Visited the homepage` : t`Visited ${value}`;
  }
};

/**
 * The best candidate for each funnel stage, in stage order, up to three
 * steps. Falls back to the table's segments in their own order when the
 * names don't fit any stage. Empty when nothing makes at least two steps.
 */
export const suggestFunnelSteps = (
  candidates: StepCandidate[],
): SuggestedStep[] => {
  const ranked = candidates
    .map(rankCandidate)
    .filter((candidate) => candidate !== null);

  const bestByStage = STAGES.map(
    (_stage, stage) =>
      ranked
        .filter((candidate) => candidate.stage === stage)
        .sort(compareCandidates)[0],
  ).filter((candidate) => candidate !== undefined);

  const picked =
    bestByStage.length >= MIN_STEPS
      ? pickStages(bestByStage)
      : candidates
          .filter((candidate) => candidate.source === "segment")
          .slice(0, MAX_STEPS);

  return picked.length >= MIN_STEPS
    ? picked.map(({ source, value }) => ({
        source,
        value,
        name: getStepName({ source, value }),
      }))
    : [];
};
