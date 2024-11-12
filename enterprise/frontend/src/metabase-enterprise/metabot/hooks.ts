import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { useMetabotContext } from "metabase/metabot";
import { METABOT_TAG, useMetabotAgentMutation } from "metabase-enterprise/api";

import {
  dismissUserMessage,
  getConfirmationOptions,
  getIsProcessing,
  getMetabotVisisble,
  getUserMessages,
  setVisible,
  submitInput,
} from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();
  const { getChatContext } = useMetabotContext();

  // TODO: create an enterprise useSelector
  const userMessages = useSelector(getUserMessages as any) as ReturnType<
    typeof getUserMessages
  >;
  const confirmationOptions = useSelector(
    getConfirmationOptions as any,
  ) as ReturnType<typeof getConfirmationOptions>;
  const isProcessing = useSelector(getIsProcessing as any) as ReturnType<
    typeof getIsProcessing
  >;

  const [, sendMessageReq] = useMetabotAgentMutation({
    fixedCacheKey: METABOT_TAG,
  });

  return {
    visible: useSelector(getMetabotVisisble as any) as ReturnType<
      typeof getMetabotVisisble
    >,
    setVisible: useCallback(
      (isVisible: boolean) => dispatch(setVisible(isVisible)),
      [dispatch],
    ),
    userMessages,
    confirmationOptions,
    dismissUserMessage: (messageIndex: number) =>
      dispatch(dismissUserMessage(messageIndex)),
    submitInput: async (message: string) => {
      const context = getChatContext();
      const history = sendMessageReq.data?.history || [];
      await dispatch(submitInput({ message, context, history }));
    },
    isDoingScience: sendMessageReq.isLoading || isProcessing,
  };
};
