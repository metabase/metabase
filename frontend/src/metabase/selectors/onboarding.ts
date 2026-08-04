import { createSelector } from "@reduxjs/toolkit";
import dayjs from "dayjs";

import type { State } from "metabase/redux/store";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getIsWhiteLabeling } from "metabase/selectors/whitelabel";
import { getSetting } from "metabase/settings";

export const getIsNewInstance = (state: State) => {
  const instanceCreated = getSetting(state, "instance-creation");
  const daysSinceCreation = dayjs().diff(dayjs(instanceCreated), "days");
  return daysSinceCreation <= 30;
};

export const getCanAccessOnboardingPage = createSelector(
  [getIsEmbeddingIframe, getIsWhiteLabeling],
  (isEmbeddingIframe, isWhiteLabelled) => {
    return !isEmbeddingIframe && !isWhiteLabelled;
  },
);
