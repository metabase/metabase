import { useClipboard, useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useRef } from "react";
import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useToast } from "metabase/common/hooks/use-toast";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { AIProviderConfigurationNotice } from "metabase/metabot/components/AIProviderConfigurationNotice";
import { useSelector } from "metabase/redux";
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
  Menu,
  Paper,
  Popover,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getResponseErrorMessage } from "metabase/utils/errors";
import type {
  HelpAssistantChatEntry,
  HelpAssistantFeedback,
} from "metabase-types/api";

import { useDiagnosticInfo } from "../use-diagnostic-info";
import { getHelpUrl } from "../utils";

import S from "./HelpAssistant.module.css";
import { HelpAssistantAnswer } from "./HelpAssistantAnswer";
import { useHelpAssistantChatContext } from "./HelpAssistantChatContext";
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
  const chat = useHelpAssistantChatContext();
  const isConfigured = !!useSetting("llm-metabot-configured?");
  const hasMessages = chat.entries.length > 0;

  const input = (
    <HelpAssistantInput
      value={chat.draft}
      isConfigured={isConfigured}
      isFollowUp={hasMessages}
      isLoading={chat.isLoading}
      onChange={chat.setDraft}
      onSubmit={() => chat.send(chat.draft)}
      onStop={chat.stop}
    />
  );
  const footer = (
    <HelpAssistantFooter
      includeDiagnosticInfo={chat.includeDiagnosticInfo}
      onIncludeDiagnosticInfoChange={chat.setIncludeDiagnosticInfo}
    />
  );

  return (
    <Flex className={S.page} direction="column">
      <HelpAssistantHeader
        entries={chat.entries}
        canDelete={chat.isConversationSaved}
        onNewChat={chat.startNewChat}
        onDelete={() => {
          if (chat.conversationId) {
            chat.deleteConversation(chat.conversationId);
          }
        }}
      />
      {hasMessages ? (
        <>
          <ConversationHistory
            entries={chat.entries}
            isLoading={chat.isLoading}
            error={chat.error}
            onRetry={chat.retry}
            onRate={chat.rateAnswer}
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
};

interface HelpAssistantHeaderProps {
  entries: HelpAssistantChatEntry[];
  canDelete: boolean;
  onNewChat: () => void;
  onDelete: () => void;
}

function HelpAssistantHeader({
  entries,
  canDelete,
  onNewChat,
  onDelete,
}: HelpAssistantHeaderProps) {
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
          <ConversationMenu
            entries={entries}
            canDelete={canDelete}
            onDelete={onDelete}
          />
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

interface ConversationMenuProps {
  entries: HelpAssistantChatEntry[];
  canDelete: boolean;
  onDelete: () => void;
}

function ConversationMenu({
  entries,
  canDelete,
  onDelete,
}: ConversationMenuProps) {
  const clipboard = useClipboard();
  const [sendToast] = useToast();

  const copyConversation = () => {
    clipboard.copy(getConversationMarkdown(entries));
    sendToast({ message: t`Copied the conversation as Markdown` });
  };

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon aria-label={t`More actions`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="copy" />}
          onClick={copyConversation}
        >
          {t`Copy conversation`}
        </Menu.Item>
        {canDelete && (
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={() => {
              onDelete();
              sendToast({ message: t`Chat deleted` });
            }}
          >
            {t`Delete chat`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
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
              onClick={() => clipboard.copy(getConversationMarkdown(entries))}
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
}

function HelpAssistantInput({
  value,
  isConfigured,
  isFollowUp,
  isLoading,
  onChange,
  onSubmit,
  onStop,
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
      <Flex justify="flex-end">
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

interface HelpAssistantFooterProps {
  includeDiagnosticInfo: boolean;
  onIncludeDiagnosticInfoChange: (include: boolean) => void;
}

function HelpAssistantFooter({
  includeDiagnosticInfo,
  onIncludeDiagnosticInfoChange,
}: HelpAssistantFooterProps) {
  return (
    <Group justify="space-between" gap="sm">
      <Checkbox
        checked={includeDiagnosticInfo}
        onChange={(event) =>
          onIncludeDiagnosticInfoChange(event.currentTarget.checked)
        }
        label={
          <Text component="span" size="sm" c="text-secondary">
            {jt`Include ${(
              <Link
                key="diagnostics"
                to={Urls.adminHelpDiagnostics()}
                variant="brand"
              >
                {t`diagnostic info`}
              </Link>
            )}`}
          </Text>
        }
      />
      <Text size="sm" c="text-secondary">
        {t`Answers can be wrong. Check the sources.`}
      </Text>
    </Group>
  );
}

interface ConversationHistoryProps {
  entries: HelpAssistantChatEntry[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onRate: (answerIndex: number, feedback: HelpAssistantFeedback) => void;
}

function ConversationHistory({
  entries,
  isLoading,
  error,
  onRetry,
  onRate,
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
  }, [entries.length, lastRole, isLoading, error]);

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
            />
          ),
        )}

        {isLoading && (
          <Group gap="sm">
            <Loader size="sm" />
            <Text c="text-secondary">{t`Working on it…`}</Text>
          </Group>
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
