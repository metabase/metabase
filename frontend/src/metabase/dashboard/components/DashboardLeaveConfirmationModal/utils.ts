import type { Location } from "history";

import { deserializeCard, parseHash } from "metabase/query_builder/actions";

export const isNavigatingToCreateADashboardQuestion = (
  nextLocation?: Location,
): boolean => {
  const isQuestionCreationUrl =
    (nextLocation?.pathname === "/question/notebook" ||
      nextLocation?.pathname === "/question/query") &&
    nextLocation?.hash;

  if (isQuestionCreationUrl) {
    const { serializedCard } = parseHash(nextLocation.hash);
    const deserializedCard = serializedCard && deserializeCard(serializedCard);

    const isDashboardQuestion =
      deserializedCard && deserializedCard.dashboard_id !== null;

    return isDashboardQuestion;
  }

  return false;
};
