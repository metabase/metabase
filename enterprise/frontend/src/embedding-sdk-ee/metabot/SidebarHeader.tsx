import { t } from "ttag";

import { Flex, Icon, Text, Tooltip, UnstyledButton } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import S from "./MetabotQuestion.module.css";

export function SidebarHeader() {
  const metabot = useMetabotAgent();

  const startNewConversation = () => {
    metabot.resetConversation();
  };

  return (
    <Flex
      px="md"
      py="sm"
      justify="space-between"
      align="center"
      className={S.sidebarHeader}
    >
      <Text fz="sm" c="var(--mb-color-text-disabled)">
        {t`AI isn't perfect. Double-check results.`}
      </Text>

      <Tooltip label={t`Start new chat`}>
        <UnstyledButton
          onClick={startNewConversation}
          data-testid="metabot-new-conversation"
        >
          <Icon
            name="edit_document_outlined"
            size="1rem"
            c="var(--mb-color-text-disabled)"
          />
        </UnstyledButton>
      </Tooltip>
    </Flex>
  );
}
