import { useDisclosure } from "@mantine/hooks";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  Box,
  Card,
  Code,
  Collapse,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";

import { getDataCheckCatalogueEntry } from "../../catalogue";
import { describeDataCheck } from "../../describe";
import type { DataCheckResult, DataCheckRun } from "../../types";
import {
  type DataCheckDisplayStatus,
  formatDataCheckYaml,
  getDataCheckDisplayStatus,
  getDataCheckErrorReasonLabel,
} from "../../utils";
import { DataCheckStatus } from "../DataCheckStatus";
import {
  type DataCheckViewProps,
  ExpectedFoundView,
  FailingRowsView,
  GenericResultView,
  MetricBandView,
  SequenceGapsView,
  TableComparisonView,
} from "../views";

export function DataCheckResultCard({ definition, result }: DataCheckRun) {
  const entry = getDataCheckCatalogueEntry(result.check);
  const status = getDataCheckDisplayStatus(result);
  const rule = describeDataCheck(definition);
  const title = definition.name ?? rule;
  const couldNotRun = status === "error" || status === "unsupported";

  return (
    <Card withBorder shadow="none" p="lg" role="group" aria-label={title}>
      <Stack gap="md">
        <Group justify="space-between" align="start" wrap="nowrap" gap="md">
          <Stack gap="xs">
            <Title order={5}>{title}</Title>
            {definition.name != null && <Text c="text-secondary">{rule}</Text>}
            {definition.where != null && (
              <Text c="text-secondary" fz="sm">
                {t`Only rows where ${definition.where}`}
              </Text>
            )}
          </Stack>
          <DataCheckStatus status={status} />
        </Group>
        {couldNotRun ? (
          <CouldNotRunMessage status={status} result={result} />
        ) : (
          <DataCheckEvidence
            definition={definition}
            result={result}
            entry={entry}
          />
        )}
        <DataCheckDetails definition={definition} result={result} />
      </Stack>
    </Card>
  );
}

function DataCheckEvidence(props: DataCheckViewProps) {
  const { result, entry } = props;
  const message = result.message != null && <Text>{result.message}</Text>;

  return match(entry?.view)
    .with("rows", () => (
      <>
        {message}
        {result.status !== "pass" && <FailingRowsView {...props} />}
      </>
    ))
    .with("gaps", () => (
      <>
        {message}
        <SequenceGapsView {...props} />
      </>
    ))
    .with("band", () => <MetricBandView {...props} />)
    .with("comparison", () => <TableComparisonView {...props} />)
    .with("list", () => <ExpectedFoundView {...props} />)
    .with("history", undefined, () => (
      <>
        {message}
        <GenericResultView {...props} />
      </>
    ))
    .exhaustive();
}

type CouldNotRunMessageProps = {
  status: DataCheckDisplayStatus;
  result: DataCheckResult;
};

function CouldNotRunMessage({ status, result }: CouldNotRunMessageProps) {
  return (
    <Stack gap="sm" p="md" bdrs="md" bg="background_page-secondary">
      <Text fw="bold">{getDataCheckErrorReasonLabel(result.reason)}</Text>
      {result.message != null &&
        (status === "unsupported" ? (
          <Text c="text-secondary">{result.message}</Text>
        ) : (
          <Box ff="monospace" fz="sm" style={{ whiteSpace: "pre-wrap" }}>
            {result.message}
          </Box>
        ))}
    </Stack>
  );
}

function DataCheckDetails({ definition, result }: DataCheckRun) {
  const [isOpen, { toggle }] = useDisclosure(false);
  const durationMs = result["duration-ms"];

  return (
    <Stack gap="sm">
      <UnstyledButton onClick={toggle} aria-expanded={isOpen}>
        <Group gap="xs">
          <Icon
            name="chevronright"
            size={12}
            c="text-secondary"
            style={{ transform: isOpen ? "rotate(90deg)" : undefined }}
          />
          <Text c="text-secondary" fw="bold" fz="sm">
            {t`How this was checked`}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={isOpen}>
        <Stack gap="md">
          <DetailsSection label={t`Definition`}>
            <Code block>{formatDataCheckYaml(definition)}</Code>
          </DetailsSection>
          {result.sql != null && (
            <DetailsSection
              label={
                durationMs != null ? t`Query, took ${durationMs} ms` : t`Query`
              }
            >
              <Code block>{result.sql}</Code>
            </DetailsSection>
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
}

type DetailsSectionProps = {
  label: string;
  children: React.ReactNode;
};

function DetailsSection({ label, children }: DetailsSectionProps) {
  return (
    <Stack gap="xs">
      <Text c="text-secondary" fz="sm">
        {label}
      </Text>
      {children}
    </Stack>
  );
}
