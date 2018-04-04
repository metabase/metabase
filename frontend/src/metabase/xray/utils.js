// takes a distance float and uses it to return a human readable phrase
// indicating how similar two items in a comparison are
import { t } from "c-3po";

export const distanceToPhrase = distance => {
  if (distance >= 0.75) {
    return t`Very different`;
  } else if (distance < 0.75 && distance >= 0.5) {
    return t`Somewhat different`;
  } else if (distance < 0.5 && distance >= 0.25) {
    return t`Somewhat similar`;
  } else {
    return t`Very similar`;
  }
};

// Small utilities to determine whether we have an entity yet or not,
// used for loading status
function has(entity) {
  return typeof entity !== "undefined" ? true : false;
}

export const hasXray = has;
export const hasComparison = has;

export const xrayLoadingMessages = [
  t`Generating your x-ray...`,
  t`Still working...`,
];

export const comparisonLoadingMessages = [
  t`Generating your comparison...`,
  t`Still working...`,
];
