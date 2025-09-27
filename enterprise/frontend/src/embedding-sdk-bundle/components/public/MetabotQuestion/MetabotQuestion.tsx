import { useEffect, useId, useRef } from "react";
import { t } from "ttag";

import { FlexibleSizeComponent } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";
import {
  SdkLoader,
  withPublicComponentWrapper,
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { SdkAdHocQuestion } from "embedding-sdk-bundle/components/private/SdkAdHocQuestion";
import { SdkQuestionDefaultView } from "embedding-sdk-bundle/components/private/SdkQuestionDefaultView";
import { useSdkDispatch } from "embedding-sdk-bundle/store";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useLocale } from "metabase/common/hooks/use-locale";
import {
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { Messages } from "metabase-enterprise/metabot/components/MetabotChat/MetabotChatMessage";
import { MetabotResetLongChatButton } from "metabase-enterprise/metabot/components/MetabotChat/MetabotResetLongChatButton";
import {
  useMetabotAgent,
  useMetabotChatHandlers,
} from "metabase-enterprise/metabot/hooks";
import { useMetabotReactions } from "metabase-enterprise/metabot/hooks/use-metabot-reactions";
import { cancelInflightAgentRequests } from "metabase-enterprise/metabot/state";

import {
  type MetabotQuestionProps,
  metabotQuestionSchema,
} from "./MetabotQuestion.schema";
import { QuestionDetails } from "./QuestionDetails";
import { QuestionTitle } from "./QuestionTitle";

const MetabotQuestionInner = ({ height }: MetabotQuestionProps) => {
  const { isLocaleLoading } = useLocale();
  const { navigateToPath } = useMetabotReactions();

  if (isLocaleLoading) {
    return <SdkLoader />;
  }

  const hasQuestion = !!navigateToPath;

  return (
    <FlexibleSizeComponent height={height}>
      <Flex w="100%" h="100%">
        {hasQuestion ? (
          <SdkAdHocQuestion
            questionPath={navigateToPath}
            title={false}
            isSaveEnabled={false}
          >
            <SdkQuestionDefaultView
              withChartTypeSelector
              title={
                <Stack gap="sm" mb="1rem">
                  <QuestionTitle />
                  <QuestionDetails />
                </Stack>
              }
            />
          </SdkAdHocQuestion>
        ) : (
          <Stack h="100%" w="100%" gap="lg" align="center" justify="center">
            <Icon
              name="ai"
              c="var(--mb-color-bg-black)"
              size="5rem"
              opacity={0.25}
            />

            <Stack gap="xs" align="center">
              <Text lh="md">{t`Ask questions to AI.`}</Text>
              <Text lh="md">{t`Results will appear here.`}</Text>
            </Stack>
          </Stack>
        )}

        <MetabotSidebar />
      </Flex>
    </FlexibleSizeComponent>
  );
};

function MetabotSidebar() {
  return (
    <Stack
      w="100%"
      maw={300}
      h="100%"
      gap={0}
      style={{
        position: "relative",
        borderLeft: "1px solid var(--mb-color-border)",
      }}
    >
      <SidebarHeader />
      <SidebarChatHistory />
      <SidebarInput />
    </Stack>
  );
}

function SidebarHeader() {
  const metabot = useMetabotAgent();

  const startNewConversation = () => {
    metabot.resetConversation();
  };

  return (
    <Flex justify="space-between" align="center" px="md" pt="md">
      <Text fz="sm" c="var(--mb-color-text-tertiary)">
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
            c="var(--mb-color-text-tertiary)"
          />
        </UnstyledButton>
      </Tooltip>
    </Flex>
  );
}

function SidebarChatHistory() {
  const metabot = useMetabotAgent();
  const { messages, errorMessages } = metabot;
  const { handleRetryMessage } = useMetabotChatHandlers();
  const { setNavigateToPath } = useMetabotReactions();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are received
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages.length, errorMessages.length, metabot.isDoingScience]);

  return (
    <Stack
      ref={scrollContainerRef}
      flex={1}
      gap={0}
      style={{ overflowY: "auto" }}
      p="md"
    >
      {messages.length > 0 || errorMessages.length > 0 ? (
        <Messages
          messages={messages}
          errorMessages={errorMessages}
          onRetryMessage={handleRetryMessage}
          isDoingScience={metabot.isDoingScience}
          showFeedbackButtons={false}
          onInternalLinkClick={setNavigateToPath}
        />
      ) : null}
      {metabot.isLongConversation && <MetabotResetLongChatButton />}
    </Stack>
  );
}

function SidebarInput() {
  const metabot = useMetabotAgent();
  const { handleSubmitInput, handleResetInput } = useMetabotChatHandlers();
  const dispatch = useSdkDispatch();

  const placeholder = metabot.isDoingScience
    ? t`Doing science...`
    : t`Ask AI a question...`;

  const cancelRequest = () => {
    dispatch(cancelInflightAgentRequests());
  };

  const resetInput = () => {
    handleResetInput();
  };

  return (
    <Flex
      gap="xs"
      px="md"
      py="sm"
      mih="48px"
      style={{ borderTop: "1px solid var(--mb-color-border)" }}
      align="center"
      justify="center"
    >
      <Flex
        style={{ flexShrink: 0, marginBottom: "8px" }}
        justify="center"
        align="center"
      >
        {metabot.isDoingScience ? (
          <Loader size="sm" />
        ) : (
          <Icon name="ai" c="var(--mb-color-brand)" size="1rem" />
        )}
      </Flex>

      <Textarea
        id="metabot-chat-input"
        data-testid="metabot-chat-input"
        w="100%"
        autosize
        minRows={1}
        maxRows={4}
        ref={metabot.promptInputRef}
        autoFocus
        value={metabot.prompt}
        disabled={metabot.isDoingScience}
        placeholder={placeholder}
        onChange={(e) => metabot.setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) {
            return;
          }

          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            handleSubmitInput(metabot.prompt);
          }
        }}
        styles={{
          input: {
            border: "none",
            borderRadius: "0",
            backgroundColor: "transparent",
            "&:focus": {
              outline: "none",
              borderColor: "transparent",
            },
          },
        }}
      />

      {metabot.isDoingScience && (
        <UnstyledButton
          h="1rem"
          data-testid="metabot-cancel-request"
          onClick={cancelRequest}
          style={{ marginBottom: "8px" }}
        >
          <Tooltip label={t`Stop generation`}>
            <Icon name="stop" c="var(--mb-color-text-secondary)" size="1rem" />
          </Tooltip>
        </UnstyledButton>
      )}

      {!metabot.isDoingScience && metabot.prompt.length > 0 && (
        <UnstyledButton
          h="1rem"
          onClick={resetInput}
          data-testid="metabot-close-chat"
          style={{ marginBottom: "8px" }}
        >
          <Icon name="close" c="var(--mb-color-text-secondary)" size="1rem" />
        </UnstyledButton>
      )}
    </Flex>
  );
}

const MetabotQuestionWrapped = (props: MetabotQuestionProps) => {
  const ensureSingleInstanceId = useId();

  return (
    <EnsureSingleInstance
      groupId="metabot-question"
      instanceId={ensureSingleInstanceId}
      multipleRegisteredInstancesWarningMessage={
        "Multiple instances of MetabotQuestion detected. Ensure only one instance of MetabotQuestion is rendered at a time."
      }
    >
      <MetabotQuestionInner {...props} />
    </EnsureSingleInstance>
  );
};

export const MetabotQuestion = Object.assign(
  withPublicComponentWrapper(MetabotQuestionWrapped),
  { schema: metabotQuestionSchema },
);
