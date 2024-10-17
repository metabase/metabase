import { useDispatch, useSelector } from "metabase/lib/redux";

import { getChatHistory, getSendMessageReq, sendMessage } from "./state";

export const useMetabotAgent = () => {
  const dispatch = useDispatch();

  return {
    chatHistory: useSelector(getChatHistory),
    sendMessage: (message: string) => dispatch(sendMessage(message)),
    sendMessageReq: useSelector(getSendMessageReq),
  };
};
