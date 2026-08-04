import { createSelector } from "@reduxjs/toolkit";
import dayjs from "dayjs";

import type { State } from "metabase/redux/store";
import { getIsWhiteLabeling } from "metabase/selectors/whitelabel";
import { getSetting } from "metabase/settings";
import { isWithinIframe } from "metabase/utils/iframe";

export const getIsNewInstance = (state: State) => {
  const instanceCreated = getSetting(state, "instance-creation");
  const daysSinceCreation = dayjs().diff(dayjs(instanceCreated), "days");
  return daysSinceCreation <= 30;
};

export const getCanAccessOnboardingPage = createSelector(
  [(_state: State) => isWithinIframe(), getIsWhiteLabeling],
  (isEmbeddingIframe, isWhiteLabelled) => {
    return !isEmbeddingIframe && !isWhiteLabelled;
  },
);
