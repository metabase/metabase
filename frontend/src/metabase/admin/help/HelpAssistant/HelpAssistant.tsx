import { useState } from "react";
import { t } from "ttag";

import { Markdown } from "metabase/common/components/Markdown";
import { SettingsSection } from "metabase/settings-components";
import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Textarea,
} from "metabase/ui";
import { getResponseErrorMessage } from "metabase/utils/errors";

import {
  type HelpAssistantMessage,
  type HelpAssistantSource,
  useSendHelpAssistantMessageMutation,
} from "./api";

type ChatEntry = HelpAssistantMessage & { sources?: HelpAssistantSource[] };

interface HelpAssistantProps {
  /** The JSON shown in the "Diagnostic info" box, sent along so the assistant knows the setup. */
  diagnosticInfo: string;
}

export const HelpAssistant = ({ diagnosticInfo }: HelpAssistantProps) => {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [sendMessage, { isLoading, error, reset }] =
    useSendHelpAssistantMessageMutation();

  const handleSend = async () => {
    const question = draft.trim();
    if (!question || isLoading) {
      return;
    }
    const nextEntries: ChatEntry[] = [
      ...entries,
      { role: "user", content: question },
    ];
    setEntries(nextEntries);
    setDraft("");
    reset();

    const result = await sendMessage({
      messages: nextEntries.map(({ role, content }) => ({ role, content })),
      diagnostic_info: diagnosticInfo,
    });
    if ("data" in result && result.data) {
      const { reply, sources } = result.data;
      setEntries([
        ...nextEntries,
        { role: "assistant", content: reply, sources },
      ]);
    }
  };

  return (
    <SettingsSection
      title={t`Ask the help assistant`}
      description={t`Describe a problem or ask how to do something. Uses the AI provider connected under Admin > AI. Prototype.`}
    >
      <Stack gap="md">
        {entries.map((entry, index) => (
          <Paper key={index} p="md" withBorder>
            <Text fw="bold" size="sm" mb="xs">
              {entry.role === "user" ? t`You` : t`Assistant`}
            </Text>
            {entry.role === "user" ? (
              <Text style={{ whiteSpace: "pre-wrap" }}>{entry.content}</Text>
            ) : (
              <Markdown>{entry.content}</Markdown>
            )}
            {entry.sources && entry.sources.length > 0 && (
              <Box mt="sm">
                <Text size="sm" c="text-secondary">{t`Pages it read:`}</Text>
                {entry.sources.map((source) => (
                  <Text size="sm" key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  </Text>
                ))}
              </Box>
            )}
          </Paper>
        ))}

        {isLoading && (
          <Group gap="sm">
            <Loader size="sm" />
            <Text c="text-secondary">{t`Reading the docs…`}</Text>
          </Group>
        )}

        {error != null && (
          <Alert color="error" title={t`Something went wrong`}>
            {getResponseErrorMessage(error) ?? t`The assistant didn't respond.`}
          </Alert>
        )}

        <Textarea
          placeholder={t`e.g. Why does my dashboard take a minute to load?`}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          autosize
          minRows={2}
          disabled={isLoading}
        />
        <Group justify="space-between">
          <Button
            variant="subtle"
            onClick={() => {
              setEntries([]);
              reset();
            }}
            disabled={isLoading || entries.length === 0}
          >
            {t`Start over`}
          </Button>
          <Button
            variant="filled"
            onClick={handleSend}
            loading={isLoading}
            disabled={!draft.trim()}
          >
            {t`Send`}
          </Button>
        </Group>
      </Stack>
    </SettingsSection>
  );
};
