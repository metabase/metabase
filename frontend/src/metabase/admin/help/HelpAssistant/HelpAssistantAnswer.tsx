import { useClipboard, useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "metabase/ui";
import type {
  HelpAssistantChatEntry,
  HelpAssistantFeedback,
  HelpAssistantSource,
} from "metabase-types/api";

import S from "./HelpAssistant.module.css";
import { getAnswerMarkdown } from "./utils";

interface HelpAssistantAnswerProps {
  entry: HelpAssistantChatEntry;
  onRate: (feedback: HelpAssistantFeedback) => void;
}

export function HelpAssistantAnswer({
  entry,
  onRate,
}: HelpAssistantAnswerProps) {
  return (
    <Box className={S.answer}>
      <AIMarkdown>{entry.content}</AIMarkdown>
      {entry.sources && entry.sources.length > 0 && (
        <AnswerSources sources={entry.sources} />
      )}
      <AnswerActions entry={entry} onRate={onRate} />
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

function AnswerActions({ entry, onRate }: HelpAssistantAnswerProps) {
  const clipboard = useClipboard({ timeout: 2000 });
  const [
    isFeedbackFormOpen,
    { open: openFeedbackForm, close: closeFeedbackForm },
  ] = useDisclosure(false);
  const rating = entry.feedback?.positive;
  const copyLabel = clipboard.copied ? t`Copied` : t`Copy as Markdown`;

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
          onClick={() => onRate({ positive: true })}
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
              onRate({ positive: false, comment });
              closeFeedbackForm();
            }}
            onCancel={closeFeedbackForm}
          />
        </Popover.Dropdown>
      </Popover>
    </Group>
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
