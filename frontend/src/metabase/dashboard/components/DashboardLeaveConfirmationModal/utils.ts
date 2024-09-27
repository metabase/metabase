import type { Location } from "history";

import { IS_LOCATION_ALLOWED } from "metabase/components/LeaveConfirmationModal/LeaveConfirmationModal";
import { deserializeCard, parseHash } from "metabase/query_builder/actions";

const isNavigatingToCreateADashboardQuestion = (
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

export const isNavigatingToCreateADashboardQuestionGuard = (
  location?: Location,
) => {
  return !isNavigatingToCreateADashboardQuestion(location);
};

export const isNavigatingElsewhereGuard = (location?: Location) => {
  if (isNavigatingToCreateADashboardQuestion(location)) {
    return false;
  }
  return IS_LOCATION_ALLOWED(location);
};
