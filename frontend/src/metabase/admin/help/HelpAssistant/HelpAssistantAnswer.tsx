import { useClipboard, useDisclosure } from "@mantine/hooks";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useToast } from "metabase/common/hooks/use-toast";
import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import {
  ActionIcon,
  Box,
  Button,
  Collapse,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type {
  HelpAssistantChatEntry,
  HelpAssistantFeedback,
  HelpAssistantSource,
  HelpAssistantStep,
} from "metabase-types/api";

import S from "./HelpAssistant.module.css";
import { getAnswerMarkdown } from "./utils";

interface HelpAssistantAnswerProps {
  entry: HelpAssistantChatEntry;
  onRate: (feedback: HelpAssistantFeedback) => void;
  /** Only when flagging is set up on the server. */
  onFlag?: (note: string) => Promise<unknown>;
}

export function HelpAssistantAnswer({
  entry,
  onRate,
  onFlag,
}: HelpAssistantAnswerProps) {
  return (
    <Box className={S.answer}>
      <AIMarkdown>{entry.content}</AIMarkdown>
      {entry.sources && entry.sources.length > 0 && (
        <AnswerSources sources={entry.sources} />
      )}
      {/* Saved before steps were recorded, older answers have none to show. */}
      {entry.steps && <AnswerSteps steps={entry.steps} />}
      <AnswerActions entry={entry} onRate={onRate} onFlag={onFlag} />
    </Box>
  );
}

function AnswerSources({ sources }: { sources: HelpAssistantSource[] }) {
  return (
    <Stack gap="xxs" mt="md">
      <Text size="sm" c="text-secondary">{t`Sources`}</Text>
      {sources.map((source) => (
        <Group key={source.url} gap="xs" wrap="nowrap">
          <Icon name="document" c="text-secondary" />
          <ExternalLink href={source.url}>{source.title}</ExternalLink>
        </Group>
      ))}
    </Stack>
  );
}

/** How the answer was made: the skills, searches and pages it used. */
function AnswerSteps({ steps }: { steps: HelpAssistantStep[] }) {
  const [isOpen, { toggle }] = useDisclosure(false);

  return (
    <Box mt="md">
      <UnstyledButton onClick={toggle} aria-expanded={isOpen}>
        <Group gap="xs" wrap="nowrap">
          <Icon
            name={isOpen ? "chevrondown" : "chevronright"}
            size={12}
            c="text-secondary"
          />
          <Text size="sm" c="text-secondary">{t`How I got this`}</Text>
        </Group>
      </UnstyledButton>
      <Collapse in={isOpen}>
        <Stack gap="xxs" mt="xs" pl="lg">
          {steps.length === 0 ? (
            <Text size="sm" c="text-secondary">
              {t`Answered from the conversation, without a skill or the docs.`}
            </Text>
          ) : (
            steps.map((step, index) => <AnswerStep key={index} step={step} />)
          )}
        </Stack>
      </Collapse>
    </Box>
  );
}

export function AnswerStep({ step }: { step: HelpAssistantStep }) {
  const { label } = step;
  switch (step.type) {
    case "skill":
      return (
        <StepLine icon="lightbulb">
          {step.earlier
            ? t`Kept following the skill “${label}”, loaded earlier`
            : t`Loaded the skill “${label}”`}
        </StepLine>
      );
    case "search":
      return (
        <StepLine icon="search">{t`Searched the docs for “${label}”`}</StepLine>
      );
    case "read":
      return (
        <StepLine icon="document">
          {t`Read`}{" "}
          {step.url ? (
            <ExternalLink href={step.url}>{label}</ExternalLink>
          ) : (
            label
          )}
        </StepLine>
      );
    case "limit":
      return (
        <StepLine icon="warning">
          {t`Used all ${label} steps, so it had to stop looking`}
        </StepLine>
      );
  }
}

function StepLine({
  icon,
  children,
}: {
  icon: "lightbulb" | "search" | "document" | "warning";
  children: ReactNode;
}) {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Icon name={icon} c="text-secondary" />
      <Text size="sm" c="text-secondary">
        {children}
      </Text>
    </Group>
  );
}

function AnswerActions({ entry, onRate, onFlag }: HelpAssistantAnswerProps) {
  const clipboard = useClipboard({ timeout: 2000 });
  const [sendToast] = useToast();
  const [
    isFeedbackFormOpen,
    { open: openFeedbackForm, close: closeFeedbackForm },
  ] = useDisclosure(false);
  const rating = entry.feedback?.positive;
  const copyLabel = clipboard.copied ? t`Copied` : t`Copy as Markdown`;

  const rate = (feedback: HelpAssistantFeedback) => {
    onRate(feedback);
    sendToast({ message: t`Thanks for the feedback` });
  };

  return (
    <Group gap="xs" mt="sm">
      <Tooltip label={copyLabel}>
        <ActionIcon
          aria-label={copyLabel}
          onClick={() => clipboard.copy(getAnswerMarkdown(entry))}
        >
          <Icon name={clipboard.copied ? "check" : "copy"} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t`Helpful`}>
        <ActionIcon
          aria-label={t`Helpful`}
          aria-pressed={rating === true}
          c={rating === true ? "brand" : undefined}
          onClick={() => {
            if (rating !== true) {
              rate({ positive: true });
            }
          }}
        >
          <Icon name="thumbs_up" />
        </ActionIcon>
      </Tooltip>
      <Popover
        opened={isFeedbackFormOpen}
        onClose={closeFeedbackForm}
        position="bottom-start"
        width={320}
        trapFocus
      >
        <Popover.Target>
          <Tooltip label={t`Not helpful`} disabled={isFeedbackFormOpen}>
            <ActionIcon
              aria-label={t`Not helpful`}
              aria-pressed={rating === false}
              c={rating === false ? "brand" : undefined}
              onClick={openFeedbackForm}
            >
              <Icon name="thumbs_down" />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown p="md">
          <NegativeFeedbackForm
            onSubmit={(comment) => {
              rate({ positive: false, comment });
              closeFeedbackForm();
            }}
            onCancel={closeFeedbackForm}
          />
        </Popover.Dropdown>
      </Popover>
      {onFlag && <FlagForReview onFlag={onFlag} />}
    </Group>
  );
}

/** Saves the chat with a note, to turn into an eval case for tuning the skills. */
function FlagForReview({
  onFlag,
}: {
  onFlag: (note: string) => Promise<unknown>;
}) {
  const [sendToast] = useToast();
  const [isFormOpen, { open: openForm, close: closeForm }] =
    useDisclosure(false);
  const [isFlagged, setIsFlagged] = useState(false);
  const label = isFlagged ? t`Flagged for review` : t`Flag for review`;

  const flag = async (note: string) => {
    try {
      await onFlag(note);
      setIsFlagged(true);
      closeForm();
      sendToast({ message: t`Saved for review` });
    } catch {
      sendToast({ message: t`Couldn't save it for review. Try again.` });
    }
  };

  return (
    <Popover
      opened={isFormOpen}
      onClose={closeForm}
      position="bottom-start"
      width={360}
      trapFocus
    >
      <Popover.Target>
        <Tooltip label={label} disabled={isFormOpen}>
          <ActionIcon
            aria-label={label}
            c={isFlagged ? "brand" : undefined}
            onClick={openForm}
          >
            <Icon name="flag" />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <FlagForm onSubmit={flag} onCancel={closeForm} />
      </Popover.Dropdown>
    </Popover>
  );
}

interface FlagFormProps {
  onSubmit: (note: string) => Promise<void>;
  onCancel: () => void;
}

function FlagForm({ onSubmit, onCancel }: FlagFormProps) {
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    setIsSaving(true);
    await onSubmit(note.trim());
    setIsSaving(false);
  };

  return (
    <Stack gap="sm">
      <Textarea
        label={t`What should it have done?`}
        description={t`Saves this chat so it can become a test case for the skills.`}
        placeholder={t`For example, ask who the recipients are before listing causes`}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        autosize
        minRows={3}
        maxRows={8}
        data-autofocus
      />
      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          disabled={!note.trim()}
          loading={isSaving}
          onClick={submit}
        >{t`Save for review`}</Button>
      </Group>
    </Stack>
  );
}

interface NegativeFeedbackFormProps {
  onSubmit: (comment: string | undefined) => void;
  onCancel: () => void;
}

function NegativeFeedbackForm({
  onSubmit,
  onCancel,
}: NegativeFeedbackFormProps) {
  const [comment, setComment] = useState("");

  return (
    <Stack gap="sm">
      <Textarea
        label={t`What went wrong? (optional)`}
        placeholder={t`For example, the steps don't match what I see`}
        value={comment}
        onChange={(event) => setComment(event.currentTarget.value)}
        autosize
        minRows={2}
        maxRows={6}
        data-autofocus
      />
      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onCancel}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          onClick={() => onSubmit(comment.trim() || undefined)}
        >{t`Send feedback`}</Button>
      </Group>
    </Stack>
  );
}
