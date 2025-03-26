import { useMemo, useState } from "react";

import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export type MetabotStatus = "ready" | "thinking" | "failed";

export interface UseMetabotHookResult {
  status: MetabotStatus;
  sendMessage(message: string): void;
  botResponses: string[];
  questionPath: string | null;
}

export function useMetabot(): UseMetabotHookResult {
  const metabot = useMetabotAgent();
  const [questionPath, setQuestionPath] = useState<string | null>(null);

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

      setQuestionPath(questionPath);
    });
  }

  return {
    status,
    sendMessage,
    questionPath,
    botResponses: metabot.userMessages,
  };
}
