import { c, t } from "ttag";

import {
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import type { DdlStatement, Proposal, ProposalSeverity } from "../../types";

import { IndexChangesSection } from "./IndexChangesSection";
import S from "./ProposalCard.module.css";
import { SqlDiff } from "./SqlDiff";

type Action =
  | { kind: "accept"; busy?: boolean; disabled?: boolean; disabledReason?: string }
  | { kind: "verify"; busy?: boolean; disabled?: boolean; disabledReason?: string }
  | { kind: "dismiss" };

type Props = {
  proposal: Proposal;
  /**
   * Current SQL of the transform being optimised. When present and the
   * proposal has a `body`, the card renders a line-diff instead of the
   * raw proposed SQL.
   */
  currentSql?: string | null;
  actions: {
    accept?: Action & { kind: "accept" };
    verify?: Action & { kind: "verify" };
    dismiss?: Action & { kind: "dismiss" };
  };
  onAccept?: () => void;
  onVerify?: () => void;
  onDismiss?: () => void;
};

export function ProposalCard({
  proposal,
  currentSql,
  actions,
  onAccept,
  onVerify,
  onDismiss,
}: Props) {
  return (
    <Box className={S.card} aria-label={proposal.name}>
      <Stack gap="sm" p="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4} miw={0}>
            <Group gap="xs">
              <SeverityBadge severity={proposal.severity} />
              <KindTag kind={proposal.kind} />
              <Text c="text-secondary" fz="sm">
                {c("Expected speedup, e.g. ≥100×")
                  .t`Expected speedup ${proposal.expected_speedup}`}
              </Text>
            </Group>
            <Text fw="bold" fz="md">
              {proposal.name}
            </Text>
            <Text c="text-secondary">{proposal.rationale}</Text>
          </Stack>
        </Group>

        {proposal.body && (
          <Box>
            <Text fz="sm" c="text-secondary" mb={4}>
              {currentSql
                ? t`Proposed changes`
                : t`Proposed transform`}
            </Text>
            {currentSql ? (
              <SqlDiff before={currentSql} after={proposal.body} />
            ) : (
              <Code block className={S.codeBlock}>
                {proposal.body}
              </Code>
            )}
          </Box>
        )}
      </Stack>

      {proposal.ddl_statement && (
        <>
          <Divider />
          <Box p="md">
            <IndexChangesSection statements={[proposal.ddl_statement]} />
          </Box>
        </>
      )}

      <Divider />
      <Group justify="flex-end" gap="sm" p="md">
        <DismissButton action={actions.dismiss} onClick={onDismiss} />
        <VerifyButton action={actions.verify} onClick={onVerify} />
        <AcceptButton action={actions.accept} onClick={onAccept} />
      </Group>
    </Box>
  );
}

function SeverityBadge({ severity }: { severity: ProposalSeverity }) {
  return (
    <Badge
      className={S[`severity_${severity}`]}
      variant="light"
      radius="sm"
    >
      {severityLabel(severity)}
    </Badge>
  );
}

function severityLabel(severity: ProposalSeverity): string {
  switch (severity) {
    case "high":
      return t`High impact`;
    case "medium":
      return t`Medium impact`;
    case "low":
      return t`Low impact`;
  }
}

function KindTag({ kind }: { kind: Proposal["kind"] }) {
  return (
    <Badge variant="outline" radius="sm" className={S.kindTag}>
      {kindLabel(kind)}
    </Badge>
  );
}

function kindLabel(kind: Proposal["kind"]): string {
  switch (kind) {
    case "rewrite":
      return t`Rewrite`;
    case "index":
      return t`Index`;
    case "rewrite+index":
      return t`Rewrite + index`;
    case "precompute":
      return t`Precompute`;
  }
}

function AcceptButton({
  action,
  onClick,
}: {
  action?: Action & { kind: "accept" };
  onClick?: () => void;
}) {
  // Show the control iff the parent supplied an action entry. The
  // callback is always non-null because TransformOptimizerSection wires
  // them up unconditionally, so don't gate on it.
  if (!action || !onClick) {
    return null;
  }
  const button = (
    <Button
      variant="filled"
      loading={action.busy}
      disabled={action.disabled}
      onClick={onClick}
    >
      {t`Accept`}
    </Button>
  );
  if (action.disabled && action.disabledReason) {
    return <Tooltip label={action.disabledReason}>{button}</Tooltip>;
  }
  return button;
}

function VerifyButton({
  action,
  onClick,
}: {
  action?: Action & { kind: "verify" };
  onClick?: () => void;
}) {
  if (!action || !onClick) {
    return null;
  }
  const button = (
    <Button
      variant="default"
      loading={action.busy}
      disabled={action.disabled}
      onClick={onClick}
    >
      {t`Verify`}
    </Button>
  );
  if (action.disabled && action.disabledReason) {
    return <Tooltip label={action.disabledReason}>{button}</Tooltip>;
  }
  return button;
}

function DismissButton({
  action,
  onClick,
}: {
  action?: Action & { kind: "dismiss" };
  onClick?: () => void;
}) {
  if (!action || !onClick) {
    return null;
  }
  return (
    <Button variant="subtle" onClick={onClick}>
      {t`Dismiss`}
    </Button>
  );
}

// Re-exports so consumers can pass typed action info from the parent.
export type { DdlStatement };
