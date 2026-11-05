import { Suspense, useState } from "react";
import { t } from "ttag";

import {
  type MetabotPageContextEntity,
  useMetabotContext,
} from "metabase/metabot";
import { isHistoryEnabledProfile } from "metabase/metabot/constants";
import {
  useIsFullPageMetabot,
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { getIsAskChatFloating } from "metabase/metabot/state";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { ActionIcon, Box, Flex, Icon, Paper, Pill, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

import { MetabotConversationHistory } from "../MetabotChat/MetabotConversationHistory";
import { createLazyMetabotChat } from "../MetabotChat/lazy";

import S from "./MetabotFloatingChat.module.css";

/**
 * PROTOTYPE: the full-page ask conversation, collapsed into a card floating in
 * the bottom-right corner of every page until the user expands it again.
 */
export const MetabotFloatingChat = () => {
  const isFloating = useSelector(getIsAskChatFloating);
  const isFullPageMetabot = useIsFullPageMetabot();

  if (!isFloating || isFullPageMetabot) {
    return null;
  }

  return <FloatingChatCard />;
};

const FloatingChatCard = () => {
  const navigate = useNavigate();
  const { conversationId, messages, profile, loadConversation } =
    useMetabotAgent("ask");
  const { isConfigured } = useUserMetabotPermissions();
  const [MetabotChat] = useState(createLazyMetabotChat);
  const { pageContextEntity: pageEntity } = useMetabotContext();
  const [removedEntityKey, setRemovedEntityKey] = useState<string | null>(null);

  const isPageContextRemoved =
    pageEntity != null && pageEntity.key === removedEntityKey;

  const headerActions = (
    <Flex gap="sm" align="center">
      {isConfigured && isHistoryEnabledProfile(profile) && (
        <MetabotConversationHistory
          profileId={profile}
          activeConversationId={conversationId}
          onConversationSelect={loadConversation}
        />
      )}
      <Tooltip label={t`Expand`} position="bottom">
        <ActionIcon
          variant="subtle"
          aria-label={t`Expand`}
          onClick={() =>
            navigate(
              // a blank conversation doesn't exist on the server yet
              messages.length > 0
                ? Urls.metabotConversation(conversationId)
                : Urls.newQuestion({ mode: "ask" }),
            )
          }
        >
          <Icon c="text-primary" name="expand" />
        </ActionIcon>
      </Tooltip>
    </Flex>
  );

  return (
    <Paper
      className={S.card}
      shadow="lg"
      radius="md"
      withBorder
      data-testid="metabot-floating-chat"
    >
      <Suspense fallback={null}>
        <MetabotChat
          conversationId={conversationId}
          agentId="ask"
          onNewConversation={() => navigate(Urls.newQuestion({ mode: "ask" }))}
          headerActions={headerActions}
          promptContext={
            pageEntity && !isPageContextRemoved ? (
              <PageContextToken
                entity={pageEntity}
                onRemove={() => setRemovedEntityKey(pageEntity.key)}
              />
            ) : undefined
          }
          excludeViewingContext={isPageContextRemoved}
        />
      </Suspense>
    </Paper>
  );
};

const PageContextToken = ({
  entity,
  onRemove,
}: {
  entity: MetabotPageContextEntity;
  onRemove: () => void;
}) => (
  <Box className={S.contextToken}>
    <Pill
      withRemoveButton
      onRemove={onRemove}
      removeButtonProps={{ "aria-label": t`Remove from context` }}
      maw="100%"
      data-testid="metabot-page-context-token"
    >
      <Icon name={entity.icon} size={12} mr="xs" flex="0 0 auto" />
      <Box component="span" className={S.contextTokenName}>
        {entity.name}
      </Box>
    </Pill>
  </Box>
);
