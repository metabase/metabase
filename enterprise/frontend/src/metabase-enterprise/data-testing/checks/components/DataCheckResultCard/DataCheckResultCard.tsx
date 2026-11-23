import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
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
import type { DataCheckRun } from "../../types";
import {
  type DataCheckDisplayStatus,
  formatDataCheckValue,
  formatDataCheckYaml,
  getDataCheckDisplayStatus,
  getDataCheckErrorReasonLabel,
  getDataCheckTitle,
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
  const title = getDataCheckTitle(definition, result);
  const durationMs = result["duration-ms"];
  const couldNotRun = status === "error" || status === "unsupported";

  return (
    <Card withBorder shadow="none" p="lg" role="group" aria-label={title}>
      <Stack gap="md">
        <Stack gap="xs">
          <Group justify="space-between" align="start" wrap="nowrap" gap="md">
            <Title order={5}>{title}</Title>
            <DataCheckStatus status={status} />
          </Group>
          <Group gap="sm">
            <Code>{result.check}</Code>
            <Text c="text-secondary">{t`on ${result.table}`}</Text>
            {result.severity === "warn" && (
              <Text c="text-secondary">{t`· warns only`}</Text>
            )}
            {durationMs != null && (
              <Text c="text-secondary">{t`· ${durationMs} ms`}</Text>
            )}
          </Group>
        </Stack>
        {couldNotRun ? (
          <CouldNotRunMessage status={status} result={result} />
        ) : (
          <>
            {result.message != null && <Text>{result.message}</Text>}
            {entry == null && <UnknownTypeNote check={result.check} />}
            <DataCheckEvidence
              definition={definition}
              result={result}
              entry={entry}
            />
          </>
        )}
        <Stack gap="xs">
          <Disclosure label={t`Definition`}>
            <Code block>{formatDataCheckYaml(definition)}</Code>
          </Disclosure>
          {result.sql != null && (
            <Disclosure label={t`Query`}>
              <Code block>{result.sql}</Code>
            </Disclosure>
          )}
          {result.threshold != null && entry == null && (
            <Disclosure label={t`Raw result`}>
              <Code block>
                {JSON.stringify(
                  { metric: result.metric, threshold: result.threshold },
                  null,
                  2,
                )}
              </Code>
            </Disclosure>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}

function DataCheckEvidence(props: DataCheckViewProps) {
  if (props.result.status === "pass" && props.entry?.view === "rows") {
    return null;
  }
  return match(props.entry?.view)
    .with("rows", () => <FailingRowsView {...props} />)
    .with("band", () => <MetricBandView {...props} />)
    .with("comparison", () => <TableComparisonView {...props} />)
    .with("list", () => <ExpectedFoundView {...props} />)
    .with("gaps", () => <SequenceGapsView {...props} />)
    .with("history", undefined, () => <GenericResultView {...props} />)
    .exhaustive();
}

type CouldNotRunMessageProps = {
  status: DataCheckDisplayStatus;
  result: DataCheckRun["result"];
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

function UnknownTypeNote({ check }: { check: string }) {
  return (
    <Group
      gap="sm"
      p="md"
      bdrs="md"
      bg="background_page-secondary"
      wrap="nowrap"
    >
      <Icon name="info" c="text-secondary" flex="none" />
      <Text c="text-secondary">
        {t`This version has no dedicated view for ${check}. It shows what the check measured and the rows it returned.`}
      </Text>
    </Group>
  );
}

type DisclosureProps = {
  label: string;
  children: ReactNode;
};

function Disclosure({ label, children }: DisclosureProps) {
  const [isOpen, { toggle }] = useDisclosure(false);

  return (
    <Stack gap="xs">
      <UnstyledButton onClick={toggle} aria-expanded={isOpen}>
        <Group gap="xs">
          <Icon
            name="chevronright"
            size={12}
            c="text-secondary"
            style={{ transform: isOpen ? "rotate(90deg)" : undefined }}
          />
          <Text c="text-secondary" fw="bold" fz="sm">
            {label}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={isOpen}>{children}</Collapse>
    </Stack>
  );
}

export function formatDataCheckSummary(result: DataCheckRun["result"]) {
  return result.message ?? formatDataCheckValue(result.metric);
}
