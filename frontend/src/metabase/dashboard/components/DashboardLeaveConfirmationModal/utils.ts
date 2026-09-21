import { deserializeCard, parseHash } from "metabase/common/utils/card";
import type { Location } from "metabase/router";

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

    return Boolean(isDashboardQuestion);
  }

  return false;
};
