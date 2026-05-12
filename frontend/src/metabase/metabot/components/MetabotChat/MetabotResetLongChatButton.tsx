import { c, jt } from "ttag";

import { Text, UnstyledButton } from "metabase/ui";

interface MetabotResetLongChatButtonProps {
  onResetConversation: () => void;
}

export const MetabotResetLongChatButton = ({
  onResetConversation,
}: MetabotResetLongChatButtonProps) => (
  <Text lh={1} c="text-tertiary" m={0} ta="center">
    {jt`This chat is getting long. You can ${(
      <UnstyledButton
        key="reset"
        data-testid="metabot-reset-long-chat"
        display="inline"
        c="brand"
        td="underline"
        onClick={onResetConversation}
      >{c("'it' refers to a chat with an AI agent")
        .t`clear it`}</UnstyledButton>
    )}.`}
  </Text>
);
