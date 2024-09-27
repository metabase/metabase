import type { Location } from "history";

import { deserializeCard, parseHash } from "metabase/query_builder/actions";

export const isNavigatingToCreateADashboardQuestion = (
  location?: Location,
): boolean => {
  const isQuestionCreationUrl =
    (location?.pathname === "/question/notebook" ||
      location?.pathname === "/question/query") &&
    location?.hash;

  if (isQuestionCreationUrl) {
    const { serializedCard } = parseHash(location.hash);
    const deserializedCard = serializedCard && deserializeCard(serializedCard);

    const isDashboardQuestion =
      deserializedCard && deserializedCard.dashboard_id !== null;

    return isDashboardQuestion;
  }

  return false;
};
