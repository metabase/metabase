import { createSelector } from "@reduxjs/toolkit";

import type { MetabotStoreState } from "./types";

export const getMetabot = (state: MetabotStoreState) => {
  console.log("getMetabot", state);

  return state.plugins.metabotPlugin;
};

export const getMetabotVisisble = createSelector(
  getMetabot,
  metabot => metabot.visible,
);

export const getUserMessages = createSelector(
  getMetabot,
  metabot => metabot.userMessages,
);

export const getConfirmationOptions = createSelector(
  getMetabot,
  metabot => metabot.confirmationOptions,
);

export const getIsProcessing = createSelector(
  getMetabot,
  metabot => metabot.isProcessing,
);

export const getLastSentContext = createSelector(
  getMetabot,
  metabot => metabot.lastSentContext,
);

export const getLastHistoryValue = createSelector(
  getMetabot,
  metabot => metabot.lastHistoryValue,
);

export const getMetabotConversationId = createSelector(
  getMetabot,
  metabot => metabot.conversationId,
);

export const getMetabotState = createSelector(
  getMetabot,
  metabot => metabot.state,
);
