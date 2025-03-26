import { useMemo, useState } from "react";

import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export type MetabotStatus = "ready" | "thinking" | "failed";

export interface UseMetabootHookResult {
  status: MetabotStatus;
  sendMessage(message: string): void;
  botResponses: string[];
  questionPath: string;
}

export function useMetabot() {
  const metabot = useMetabotAgent();
  const [response, setResponse] = useState<string | null>(null);

  const status = useMemo(() => {
    if (metabot.isDoingScience) {
      return "thinking";
    }

    return "ready";
  }, [metabot]);

  function sendMessage(message: string) {
    metabot.submitInput(message).then(result => {
      // TODO: this is a hack to get the question path from the result
      //       we should lift this up to the Redux action!
      const questionPath = (
        result?.payload as any
      )?.payload?.data?.reactions?.find(
        (reaction: { type: string; url: string }) =>
          reaction.type === "metabot.reaction/redirect",
      )?.url;

      setResponse(questionPath);
    });
  }

  return {
    status,
    sendMessage,
    response,
    botResponses: metabot.userMessages,
  };
}
