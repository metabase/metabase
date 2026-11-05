import { useDisclosure } from "@mantine/hooks";
import { msgid, ngettext, t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import {
  Badge,
  Box,
  Button,
  Code,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
} from "metabase/ui";

import { countFailingChecks, getWorstFailingCheck } from "./generated-checks";
import type { CheckResults, CheckTableRef, GeneratedCheck } from "./types";
import { formatChecksYaml, formatTableRef } from "./yaml";

type GeneratedChecksSummaryProps = {
  table: CheckTableRef;
  checks: readonly GeneratedCheck[];
  results: CheckResults;
};

export const getChecksFilePath = ({ schema, name }: CheckTableRef) =>
  schema ? `checks/${schema}/${name}.yaml` : `checks/${name}.yaml`;

export function GeneratedChecksSummary({
  table,
  checks,
  results,
}: GeneratedChecksSummaryProps) {
  const [isOpen, { open, close }] = useDisclosure(false);
  const failingCount = countFailingChecks(checks, results);
  const worstCheck = getWorstFailingCheck(checks, results);

  if (checks.length === 0) {
    return (
      <Text c="text-secondary">{t`No checks from this table's metadata yet`}</Text>
    );
  }

  return (
    <Stack gap="xs" py="xs" data-testid="generated-checks-summary">
      {worstCheck != null && (
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Icon
            name="warning"
            c={
              worstCheck.severity === "warn"
                ? "feedback-warning"
                : "feedback-negative"
            }
            mt={2}
            flex="0 0 auto"
          />
          <Text fw="bold">{getFailureSummary(results, worstCheck)}</Text>
        </Group>
      )}
      <Text c={worstCheck != null ? "text-secondary" : undefined}>
        {ngettext(
          msgid`${checks.length} check from this table's metadata`,
          `${checks.length} checks from this table's metadata`,
          checks.length,
        )}
        {" · "}
        {failingCount > 0 ? (
          <Text component="span" fw="bold" c="feedback-warning">
            {t`${failingCount} failing`}
          </Text>
        ) : (
          <Text component="span" c="text-secondary">{t`all passing`}</Text>
        )}
      </Text>
      <Button
        size="compact-sm"
        variant="subtle"
        px={0}
        w="fit-content"
        leftSection={<Icon name="external" />}
        onClick={open}
      >
        {t`View in data quality`}
      </Button>
      {isOpen && (
        <GeneratedChecksModal
          table={table}
          checks={checks}
          results={results}
          onClose={close}
        />
      )}
    </Stack>
  );
}

function GeneratedChecksModal({
  table,
  checks,
  results,
  onClose,
}: GeneratedChecksSummaryProps & { onClose: () => void }) {
  const yaml = formatChecksYaml(checks);
  const failingChecks = checks.filter(
    ({ id }) => results.get(id)?.status === "failing",
  );

  return (
    <Modal
      opened
      size="xl"
      title={t`Data quality checks for ${formatTableRef(table)}`}
      onClose={onClose}
    >
      <Stack gap="lg">
        <Text c="text-secondary">
          {t`Generated from this table's metadata, in the data quality assertion language. The checker runs them in CI and again as new data arrives.`}
        </Text>
        {failingChecks.length > 0 && (
          <Stack gap="sm">
            <Text fw="bold">{t`Failing on the latest data`}</Text>
            {failingChecks.map((check) => (
              <FailingCheckRow
                key={check.id}
                check={check}
                summary={getFailureSummary(results, check)}
              />
            ))}
          </Stack>
        )}
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Code>{getChecksFilePath(table)}</Code>
            <CopyButton value={yaml} aria-label={t`Copy YAML`} />
          </Group>
          <Box
            mah="50vh"
            bd="1px solid var(--mb-color-border-neutral)"
            bdrs="md"
            style={{ overflow: "auto" }}
          >
            <CodeEditor value={yaml} language="yaml" readOnly />
          </Box>
        </Stack>
      </Stack>
    </Modal>
  );
}

function getFailureSummary(results: CheckResults, check: GeneratedCheck) {
  const result = results.get(check.id);
  return result?.status === "failing" ? result.summary : "";
}

function FailingCheckRow({
  check,
  summary,
}: {
  check: GeneratedCheck;
  summary: string;
}) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Badge
        color={check.severity === "warn" ? "warning" : "negative"}
        variant="light"
        size="sm"
        flex="0 0 auto"
      >
        {check.severity === "warn" ? t`Warning` : t`Failing`}
      </Badge>
      <Stack gap={0}>
        <Text fw="bold">{check.name}</Text>
        <Text size="sm" c="text-secondary">
          {summary}
        </Text>
      </Stack>
    </Group>
  );
}
