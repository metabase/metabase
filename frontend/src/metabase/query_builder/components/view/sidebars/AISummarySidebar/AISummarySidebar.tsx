import { useClipboard } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import Markdown from "metabase/common/components/Markdown";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { AiApi } from "metabase/services";
import { Box, Button, Group, Icon, Stack, Text, Tooltip } from "metabase/ui";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type Question from "metabase-lib/v1/Question";

interface AiSummarySidebarProps {
  question: Question;
  onClose: () => void;
}

type SummaryResponse = {
  markdown: string;
  model: string;
  row_count_sent: number;
  col_count_sent: number;
};

export const AISummarySidebar = ({
  question,
  onClose,
}: AiSummarySidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  const clipboard = useClipboard({ timeout: 2000 });

  const parameters = useMemo(
    () => normalizeParameters(question.parameters()),
    [question],
  );

  useMount(() => {
    setIsOpen(true);
  });

  useEffect(() => {
    let isCancelled = false;

    const fetchSummary = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await AiApi.summary({
          cardId: question.id(),
          parameters,
        });
        if (!isCancelled) {
          setSummary(response);
        }
      } catch (fetchError) {
        if (!isCancelled) {
          setError(getErrorMessage(fetchError));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSummary();

    return () => {
      isCancelled = true;
    };
  }, [question, parameters]);

  const handleCopy = () => {
    if (summary?.markdown) {
      clipboard.copy(summary.markdown);
    }
  };

  return (
    <Sidesheet
      title={t`AI Summary`}
      isOpen={isOpen}
      onClose={onClose}
      data-testid="ai-summary-sidebar"
      size="md"
    >
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text fw={700}>{t`Summary`}</Text>
          <Group gap="xs">
            <Tooltip
              label={t`Copied!`}
              opened={clipboard.copied}
              position="bottom"
            >
              <Box>
                <Button
                  variant="default"
                  leftSection={<Icon name="copy" />}
                  onClick={handleCopy}
                  disabled={!summary?.markdown}
                >
                  {t`Copy`}
                </Button>
              </Box>
            </Tooltip>
            <Button variant="subtle" onClick={onClose}>
              {t`Close`}
            </Button>
          </Group>
        </Group>

        {isLoading && <Text c="text-secondary">{t`Generating summary…`}</Text>}

        {error && (
          <Text c="error" data-testid="ai-summary-error">
            {error}
          </Text>
        )}

        {summary?.markdown && !isLoading && !error && (
          <Stack gap="sm">
            <Text size="sm" c="text-secondary">
              {t`Model`}: {summary.model} · {t`Rows sent`}: {summary.row_count_sent} · {t`Columns sent`}: {summary.col_count_sent}
            </Text>
            <Markdown>{summary.markdown}</Markdown>
          </Stack>
        )}
      </Stack>
    </Sidesheet>
  );
};
