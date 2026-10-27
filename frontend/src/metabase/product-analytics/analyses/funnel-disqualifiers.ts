import type { EventDefinition } from "../events/types";

import { isEventDefinition, isUnknownArray } from "./setting-helpers";

/** Two of a funnel's steps, numbered from 0, with `fromStep` first. */
export type DisqualifierSteps = {
  fromStep: number;
  toStep: number;
};

/** An event that ends someone's attempt at a funnel, after the step before it. */
export type FunnelDisqualifier = {
  event: EventDefinition;
  /** The steps it applies between. `null`: anywhere in the funnel. */
  between: DisqualifierSteps | null;
};

/**
 * The steps a disqualifier applies between, in a funnel of `stepCount` steps.
 * A range past the last step ends at it; one with no steps left in it is the
 * whole funnel.
 */
export const getDisqualifierSteps = (
  between: DisqualifierSteps | null,
  stepCount: number,
): DisqualifierSteps => {
  const lastStep = Math.max(stepCount - 1, 0);
  const toStep = Math.min(between?.toStep ?? lastStep, lastStep);
  const fromStep = between?.fromStep ?? 0;
  return fromStep < toStep
    ? { fromStep, toStep }
    : { fromStep: 0, toStep: lastStep };
};

const isStepNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isDisqualifierSteps = (value: unknown): boolean =>
  value === null ||
  (typeof value === "object" &&
    "fromStep" in value &&
    "toStep" in value &&
    isStepNumber(value.fromStep) &&
    isStepNumber(value.toStep) &&
    value.fromStep < value.toStep);

const isFunnelDisqualifier = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  "event" in value &&
  "between" in value &&
  isEventDefinition(value.event) &&
  isDisqualifierSteps(value.between);

export const isFunnelDisqualifierList = (value: unknown): boolean =>
  isUnknownArray(value) && value.every(isFunnelDisqualifier);
