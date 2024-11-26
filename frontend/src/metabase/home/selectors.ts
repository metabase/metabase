import { createSelector } from "@reduxjs/toolkit";
import dayjs from "dayjs";

import { getIsEmbedded } from "metabase/selectors/embed";
import { getSetting } from "metabase/selectors/settings";
import { getIsWhiteLabeling } from "metabase/selectors/whitelabel";
import type { State } from "metabase-types/store";

export const getIsXrayEnabled = (state: State) => {
  return getSetting(state, "enable-xrays");
};

export const getHasMetabotLogo = (state: State) => {
  return getSetting(state, "show-metabot");
};

const getIsNewInstance = (state: State) => {
  const instanceCreated = getSetting(state, "instance-creation");
  const daysSinceCreation = dayjs().diff(dayjs(instanceCreated), "days");
  return daysSinceCreation <= 30;
};

export const getShouldShowOnboardingLink = createSelector(
  [getIsNewInstance, getIsEmbedded, getIsWhiteLabeling],
  (isNewInstance, isEmbedded, isWhiteLabelled) => {
    return isNewInstance && !isEmbedded && !isWhiteLabelled;
  },
);
