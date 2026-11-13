import { useClipboard, useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useToast } from "metabase/common/hooks/use-toast";
import { getUserIsAdmin } from "metabase/current-user";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { useSelector } from "metabase/redux";
import { Navigate, useNavigate, useParams } from "metabase/router";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { useSetting } from "metabase/settings";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Group,
  Icon,
  Loader,
  Paper,
  Popover,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getResponseErrorMessage } from "metabase/utils/errors";
import type {
  HelpAssistantChatEntry,
  HelpAssistantFeedback,
  HelpAssistantStep,
} from "metabase-types/api";

import { useDiagnosticInfo } from "../use-diagnostic-info";
import { getHelpUrl } from "../utils";

import S from "./HelpAssistant.module.css";
import { AnswerStep, HelpAssistantAnswer } from "./HelpAssistantAnswer";
import { useHelpAssistantChatContext } from "./HelpAssistantChatContext";
import type { HelpAssistantChat } from "./use-help-assistant-chat";
import { getConversationMarkdown } from "./utils";

// Space above a question when it's scrolled to the top of the conversation.
const QUESTION_SCROLL_MARGIN_PX = 24;

// Each prompt matches one of the assistant's skills in resources/help_assistant/skills.
const getSuggestedPrompts = () => [
  t`My database connection stopped working`,
  t`New tables or columns don't show up`,
  t`A dashboard takes a long time to load`,
  t`Dashboard subscriptions aren't sending`,
  t`Someone can't see a dashboard they should see`,
  t`How do I embed a dashboard in my app?`,
];

export const HelpAssistant = () => {
  const isAdmin = useSelector(getUserIsAdmin);

  // People with the Monitoring permission can open Help, but only admins can
  // use the assistant.
  if (!isAdmin) {
    return <Navigate to={Urls.adminHelpDiagnostics()} replace />;
  }
  return <HelpAssistantChatPage />;
};

function HelpAssistantChatPage() {
  const chat = useHelpAssistantChatContext();
  const isConfigured = !!useSetting("llm-metabot-configured?");
  const hasMessages = chat.entries.length > 0;
  const navigate = useNavigate();
  const { conversationId: routeConversationId } = useParams();
  useConversationUrl(chat);

  const startNewChat = () => {
    chat.startNewChat();
    if (routeConversationId != null) {
      navigate(Urls.adminHelp());
    }
  };

  const input = (
    <HelpAssistantInput
      value={chat.draft}
      isConfigured={isConfigured}
      isFollowUp={hasMessages}
      isLoading={chat.isLoading}
      onChange={chat.setDraft}
      onSubmit={() => chat.send(chat.draft)}
      onStop={chat.stop}
      options={
        <HelpAssistantOptions
          includeDiagnosticInfo={chat.includeDiagnosticInfo}
          onIncludeDiagnosticInfoChange={chat.setIncludeDiagnosticInfo}
          allowInstanceChecks={chat.allowInstanceChecks}
          onAllowInstanceChecksChange={chat.setAllowInstanceChecks}
        />
      }
    />
  );
  const footer = isConfigured && (
    <Text size="xs" c="text-secondary" ta="center">
      {t`Answers can be wrong. Check the sources.`}
    </Text>
  );

  return (
    <Flex className={S.page} direction="column">
      <HelpAssistantHeader entries={chat.entries} onNewChat={startNewChat} />
      {hasMessages ? (
        <>
          <ConversationHistory
            // A different chat starts at its own scroll position.
            key={chat.conversationId}
            entries={chat.entries}
            isLoading={chat.isLoading}
            pendingSteps={chat.pendingSteps}
            error={chat.error}
            onRetry={chat.retry}
            onRate={chat.rateAnswer}
            onFlag={chat.flagsEnabled ? chat.flagAnswer : undefined}
          />
          <Box px="xl" pb="lg">
            <Stack className={cx(S.column, S.composer)} gap="sm">
              {input}
              {footer}
            </Stack>
          </Box>
        </>
      ) : (
        <Box className={S.scrollArea} px="xl">
          <Stack className={S.column} gap="lg" pt="3.5rem" pb="xl">
            <Stack gap="xs">
              <Title order={2}>{t`How can we help?`}</Title>
              <Text c="text-secondary">
                {t`Describe a problem or ask how to set something up. The assistant answers from the Metabase docs.`}
              </Text>
            </Stack>
            <Stack gap="sm">
              {input}
              {footer}
            </Stack>
            {isConfigured && (
              <Stack gap="xs" align="flex-start">
                {/* The same inset as the text of the suggestions below. */}
                <Text size="sm" fw="bold" c="text-secondary" px="md">
                  {t`Common questions`}
                </Text>
                <Stack gap="xxs" align="flex-start">
                  {getSuggestedPrompts().map((prompt) => (
                    <UnstyledButton
                      key={prompt}
                      className={S.promptSuggestion}
                      onClick={() => chat.send(prompt)}
                    >
                      {prompt}
                    </UnstyledButton>
                  ))}
                </Stack>
              </Stack>
            )}
          </Stack>
        </Box>
      )}
    </Flex>
  );
}

/**
 * Keeps the open chat and the URL in step. `/admin/help/chat/:conversationId`
 * is a saved chat, and `/admin/help` is the new chat.
 */
function useConversationUrl(chat: HelpAssistantChat) {
  const { conversationId: routeConversationId = null } = useParams();
  const navigate = useNavigate();
  // The route this page has already acted on. It acts once per route, so that
  // a state change, such as "New chat" before its navigation is done, can't
  // open the chat again.
  const handledRouteRef = useRef<string | null | undefined>(undefined);
  const {
    conversationId,
    isConversationSaved,
    areConversationsLoaded,
    hasConversation,
    openConversation,
    openNewChat,
  } = chat;

  useEffect(() => {
    const isNewRoute = handledRouteRef.current !== routeConversationId;

    if (routeConversationId == null) {
      if (isNewRoute) {
        handledRouteRef.current = null;
        openNewChat();
      } else if (conversationId != null && isConversationSaved) {
        // The new chat got its first answer, so it is saved now.
        navigate(Urls.adminHelpChat(conversationId), { replace: true });
      }
      return;
    }

    if (!isNewRoute || !areConversationsLoaded) {
      return;
    }
    handledRouteRef.current = routeConversationId;
    if (routeConversationId === conversationId) {
      return;
    }
    if (hasConversation(routeConversationId)) {
      openConversation(routeConversationId);
    } else {
      navigate(Urls.adminHelp(), { replace: true });
    }
  }, [
    routeConversationId,
    conversationId,
    isConversationSaved,
    areConversationsLoaded,
    hasConversation,
    openConversation,
    openNewChat,
    navigate,
  ]);
}

interface HelpAssistantHeaderProps {
  entries: HelpAssistantChatEntry[];
  onNewChat: () => void;
}

function HelpAssistantHeader({ entries, onNewChat }: HelpAssistantHeaderProps) {
  const hasMessages = entries.length > 0;

  return (
    <Group
      className={S.header}
      justify="space-between"
      wrap="nowrap"
      px="xl"
      py="md"
    >
      <Group gap="sm" wrap="nowrap">
        <Text fw="bold">{t`Help assistant`}</Text>
        <Badge>{t`Prototype`}</Badge>
      </Group>
      {hasMessages && (
        <Group gap="xs" wrap="nowrap">
          <ContactSupportButton entries={entries} />
          <CopyConversationButton entries={entries} />
          <Button
            variant="subtle"
            leftSection={<Icon name="add" />}
            onClick={onNewChat}
          >
            {t`New chat`}
          </Button>
        </Group>
      )}
    </Group>
  );
}

function CopyConversationButton({
  entries,
}: {
  entries: HelpAssistantChatEntry[];
}) {
  const clipboard = useClipboard();
  const [sendToast] = useToast();
  const { tag } = useSetting("version");

  const copyConversation = () => {
    clipboard.copy(getConversationMarkdown(entries, tag));
    sendToast({ message: t`Copied the conversation as Markdown` });
  };

  return (
    <Tooltip label={t`Copy the whole conversation as Markdown`}>
      <Button
        variant="subtle"
        leftSection={<Icon name="copy" />}
        onClick={copyConversation}
      >
        {t`Copy chat`}
      </Button>
    </Tooltip>
  );
}

function ContactSupportButton({
  entries,
}: {
  entries: HelpAssistantChatEntry[];
}) {
  const isPaidPlan = useSelector(getIsPaidPlan);
  const { tag } = useSetting("version");
  const { compactDiagnosticInfo } = useDiagnosticInfo();
  const clipboard = useClipboard({ timeout: 2000 });
  const [isOpen, { toggle, close }] = useDisclosure(false);
  const helpUrl = getHelpUrl({
    isPaidPlan,
    versionTag: tag,
    compactDiagnosticInfo,
  });

  return (
    <Popover opened={isOpen} onClose={close} position="bottom-end" width={320}>
      <Popover.Target>
        <Button
          variant="subtle"
          leftSection={<Icon name="mail" />}
          onClick={toggle}
        >
          {isPaidPlan ? t`Contact support` : t`Get more help`}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="md">
          <Text>
            {t`Copy this conversation and paste it into your message, so you don't have to explain the problem again.`}
          </Text>
          <Group gap="sm">
            <Button
              leftSection={<Icon name={clipboard.copied ? "check" : "copy"} />}
              onClick={() =>
                clipboard.copy(getConversationMarkdown(entries, tag))
              }
            >
              {clipboard.copied ? t`Copied` : t`Copy conversation`}
            </Button>
            <Button
              component={ExternalLink}
              href={helpUrl}
              variant="filled"
              rightSection={<Icon name="external" />}
              onClick={close}
            >
              {isPaidPlan ? t`Open support` : t`Open help page`}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

interface HelpAssistantInputProps {
  value: string;
  isConfigured: boolean;
  isFollowUp: boolean;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  /** Shown at the bottom left of the box, once the AI connection is set up. */
  options: ReactNode;
}

function HelpAssistantInput({
  value,
  isConfigured,
  isFollowUp,
  isLoading,
  onChange,
  onSubmit,
  onStop,
  options,
}: HelpAssistantInputProps) {
  const [isAiSetupOpen, { open: openAiSetup, close: closeAiSetup }] =
    useDisclosure(false);

  return (
    <Paper className={S.inputContainer} withBorder shadow="md">
      {isConfigured ? (
        // Stays enabled while the assistant works, so it keeps focus and the
        // next question can be typed. Enter only sends once the answer is in.
        <Textarea
          variant="unstyled"
          placeholder={
            isFollowUp
              ? t`Ask a follow-up question`
              : t`e.g. Why does my dashboard take a minute to load?`
          }
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter also confirms a word in an input method editor (IME), for
            // example for Japanese.
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          autosize
          autoFocus
          minRows={isFollowUp ? 1 : 2}
          maxRows={8}
          aria-label={t`Ask the help assistant`}
          data-testid="help-assistant-input"
        />
      ) : (
        <>
          <AIProviderConfigurationNotice
            featureName={t`the help assistant`}
            onConfigureAi={openAiSetup}
            inline
            py="sm"
          />
          <AIProviderConfigurationModal
            opened={isAiSetupOpen}
            onClose={closeAiSetup}
          />
        </>
      )}
      <Flex justify="space-between" align="flex-end" gap="md">
        <Box>{isConfigured && options}</Box>
        {isLoading ? (
          <ActionIcon
            variant="filled"
            size="2rem"
            aria-label={t`Stop`}
            onClick={onStop}
          >
            <Icon name="stop" />
          </ActionIcon>
        ) : (
          <ActionIcon
            variant="filled"
            size="2rem"
            aria-label={t`Send`}
            disabled={!isConfigured || !value.trim()}
            onClick={onSubmit}
          >
            <Icon name="arrow_up" />
          </ActionIcon>
        )}
      </Flex>
    </Paper>
  );
}

interface HelpAssistantOptionsProps {
  includeDiagnosticInfo: boolean;
  onIncludeDiagnosticInfoChange: (include: boolean) => void;
  allowInstanceChecks: boolean;
  onAllowInstanceChecksChange: (allow: boolean) => void;
}

function HelpAssistantOptions({
  includeDiagnosticInfo,
  onIncludeDiagnosticInfoChange,
  allowInstanceChecks,
  onAllowInstanceChecksChange,
}: HelpAssistantOptionsProps) {
  return (
    <Group gap="md">
      <Checkbox
        checked={includeDiagnosticInfo}
        onChange={(event) =>
          onIncludeDiagnosticInfoChange(event.currentTarget.checked)
        }
        label={
          <Group gap="xxs" wrap="nowrap">
            <Text component="span" size="sm" c="text-secondary">
              {t`Include diagnostic info`}
            </Text>
            <Tooltip
              label={t`Sends your Metabase version, browser and system details with each question, the same details shown on the Diagnostic info page.`}
              maw="20rem"
              multiline
            >
              <Icon name="info" size={12} c="text-secondary" />
            </Tooltip>
          </Group>
        }
      />
      <Checkbox
        checked={allowInstanceChecks}
        onChange={(event) =>
          onAllowInstanceChecksChange(event.currentTarget.checked)
        }
        label={
          <Text component="span" size="sm" c="text-secondary">
            {t`Let the assistant check logs and settings`}
          </Text>
        }
      />
    </Group>
  );
}

interface ConversationHistoryProps {
  entries: HelpAssistantChatEntry[];
  isLoading: boolean;
  /** What the assistant has done so far for the answer it's working on. */
  pendingSteps: HelpAssistantStep[];
  error: unknown;
  onRetry: () => void;
  onRate: (answerIndex: number, feedback: HelpAssistantFeedback) => void;
  /** Only when flagging is set up on the server. */
  onFlag?: (answerIndex: number, note: string) => Promise<unknown>;
}

function ConversationHistory({
  entries,
  isLoading,
  pendingSteps,
  error,
  onRetry,
  onRate,
  onFlag,
}: ConversationHistoryProps) {
  const historyRef = useRef<HTMLDivElement>(null);
  const lastRole = entries[entries.length - 1]?.role;

  // A new answer arrives all at once, so show it from its start: put the
  // question it answers at the top. Anything else goes to the bottom.
  useLayoutEffect(() => {
    const history = historyRef.current;
    if (!history) {
      return;
    }
    const questions = history.querySelectorAll<HTMLElement>(
      "[data-message-role='user']",
    );
    const lastQuestion = questions[questions.length - 1];
    if (lastRole === "assistant" && lastQuestion) {
      const questionTop =
        lastQuestion.getBoundingClientRect().top -
        history.getBoundingClientRect().top;
      history.scrollTop += questionTop - QUESTION_SCROLL_MARGIN_PX;
    } else {
      history.scrollTop = history.scrollHeight;
    }
  }, [entries.length, lastRole, isLoading, pendingSteps.length, error]);

  return (
    <Box
      ref={historyRef}
      className={S.scrollArea}
      px="xl"
      role="log"
      aria-label={t`Conversation`}
      aria-busy={isLoading}
    >
      <Stack className={S.column} gap="lg" py="xl">
        {entries.map((entry, index) =>
          entry.role === "user" ? (
            <Text
              key={index}
              className={S.userMessage}
              data-message-role="user"
            >
              {entry.content}
            </Text>
          ) : (
            <HelpAssistantAnswer
              key={index}
              entry={entry}
              onRate={(feedback) => onRate(index, feedback)}
              onFlag={onFlag && ((note) => onFlag(index, note))}
            />
          ),
        )}

        {isLoading && (
          <Stack gap="xs">
            <Group gap="sm">
              <Loader size="sm" />
              <Text c="text-secondary">{t`Working on it…`}</Text>
            </Group>
            {pendingSteps.length > 0 && (
              <Stack
                gap="xxs"
                pl="lg"
                role="list"
                aria-label={t`What the assistant has done so far`}
              >
                {pendingSteps.map((step, index) => (
                  <Box key={index} role="listitem">
                    <AnswerStep step={step} />
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        )}

        {error != null && (
          <Alert color="error" title={t`Something went wrong`}>
            <Stack gap="sm" align="flex-start">
              <Text>
                {getResponseErrorMessage(error) ??
                  t`The assistant didn't respond.`}
              </Text>
              <Button
                variant="default"
                leftSection={<Icon name="refresh" />}
                onClick={onRetry}
              >
                {t`Try again`}
              </Button>
            </Stack>
          </Alert>
        )}
      </Stack>
    </Box>
  );
}
