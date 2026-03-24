import type Question from "metabase-lib/v1/Question";

import { canRunCard } from "./card";

/**
 * Returns true if the question is valid and runnable.
 */
export function canRunQuestion(question: Question) {
  return canRunCard(question.metadata(), question.card());
}
