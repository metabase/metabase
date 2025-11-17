import { c, jt } from "ttag";

import { Text, UnstyledButton } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

export const MetabotResetLongChatButton = () => {
  const metabot = useMetabotAgent();

  return (
    <Text lh={1} c="text-disabled" m={0} ta="center">
      {jt`This chat is getting long. You can ${(
        <UnstyledButton
          key="reset"
          data-testid="metabot-reset-long-chat"
          display="inline"
          c="brand"
          td="underline"
          onClick={() => metabot.resetConversation()}
        >{c("'it' refers to a chat with an AI agent")
          .t`clear it`}</UnstyledButton>
      )}.`}
    </Text>
  );
};
