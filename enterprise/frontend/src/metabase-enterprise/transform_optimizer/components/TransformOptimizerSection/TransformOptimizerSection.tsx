import { useCallback, useState } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Alert, Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import {
  type VerifyResponse,
  useAcceptProposalMutation,
  useVerifyProposalMutation,
} from "../../api";
import { useOptimizerStream } from "../../hooks/use-optimizer-stream";
import type { Proposal } from "../../types";
import { OptimizationDegreeDial } from "../OptimizationDegreeDial";
import { ProposalCard } from "../ProposalCard";

type Props = {
  transform: Transform;
  readOnly?: boolean;
};

export function TransformOptimizerSection({ transform, readOnly }: Props) {
  const currentSql = getNativeSql(transform);
  const { state, start, abort, dismissProposal } = useOptimizerStream({
    transformId: transform.id,
  });
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [verify, verifyResult] = useVerifyProposalMutation();
  const [accept, acceptResult] = useAcceptProposalMutation();
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);

  const handleStart = useCallback(() => start(), [start]);

  const handleVerify = useCallback(
    async (proposal: Proposal) => {
      setBusyProposalId(proposal.id);
      const { data, error } = await verify({
        transformId: transform.id,
        proposal,
      });
      setBusyProposalId(null);
      if (error) {
        sendErrorToast(t`Failed to verify proposal`);
        return;
      }
      reportVerify(data as VerifyResponse, sendSuccessToast, sendErrorToast);
    },
    [verify, transform.id, sendErrorToast, sendSuccessToast],
  );

  const handleAccept = useCallback(
    async (proposal: Proposal) => {
      const proposalIds = topoOrderForAccept(proposal, state.proposals);
      setBusyProposalId(proposal.id);
      const { error } = await accept({
        transformId: transform.id,
        proposalIds,
      });
      setBusyProposalId(null);
      if (error) {
        sendErrorToast(t`Failed to accept proposal`);
        return;
      }
      sendSuccessToast(t`New transforms created`);
    },
    [accept, transform.id, state.proposals, sendErrorToast, sendSuccessToast],
  );

  const isStreaming = state.status === "streaming";
  const isDone = state.status === "done";
  const isErrored = state.status === "error";
  const isCollapsed =
    isDone && state.optimizationDegree === 100 && state.proposals.length === 0;
  const canTrigger = !isStreaming;

  // Per the contract: when streaming finishes with score 100, collapse the
  // panel to the "already optimized" affordance.
  if (isCollapsed) {
    return (
      <Stack p="lg" gap="sm">
        <Alert color="success" icon={<Icon name="check" />}>
          <Text fw="bold">{t`Already optimized — nothing to suggest`}</Text>
          {state.summary && (
            <Text c="text-secondary" mt={4}>
              {state.summary}
            </Text>
          )}
        </Alert>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleStart}>
            {t`Re-analyze`}
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack p="lg" gap="md">
      <Group justify="space-between" align="flex-start" gap="lg" wrap="nowrap">
        <Stack gap={4} miw={0}>
          <Text fw="bold">{t`Optimize this transform`}</Text>
          <Text c="text-secondary">
            {t`Analyze the current native SQL and propose equivalent transforms with better performance.`}
          </Text>
        </Stack>
        <TriggerButton
          status={state.status}
          canTrigger={canTrigger}
          onStart={handleStart}
          onAbort={abort}
        />
      </Group>

      {(isStreaming || isDone || isErrored) && (
        <Stack gap="md">
          {!isErrored && (
            <OptimizationDegreeDial
              status={isStreaming ? "streaming" : "done"}
              score={state.optimizationDegree}
            />
          )}

          {state.summary && !isErrored && (
            <Box>
              <Text c="text-secondary">{state.summary}</Text>
            </Box>
          )}

          {isErrored && state.error && (
            <Alert color="error" icon={<Icon name="warning" />}>
              <Text fw="bold">{t`Couldn't analyze transform`}</Text>
              <Text c="text-secondary" mt={4}>
                {state.error.message}
              </Text>
              {state.error.retryable && (
                <Group justify="flex-start" mt="sm">
                  <Button size="xs" variant="default" onClick={handleStart}>
                    {t`Retry`}
                  </Button>
                </Group>
              )}
            </Alert>
          )}

          <Stack gap="md">
            {state.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                currentSql={currentSql}
                actions={{
                  accept: {
                    kind: "accept",
                    busy:
                      busyProposalId === proposal.id && acceptResult.isLoading,
                    disabled: readOnly,
                    disabledReason: readOnly
                      ? t`You don't have permission to create transforms here.`
                      : undefined,
                  },
                  verify: {
                    kind: "verify",
                    busy:
                      busyProposalId === proposal.id && verifyResult.isLoading,
                  },
                  dismiss: { kind: "dismiss" },
                }}
                onAccept={() => handleAccept(proposal)}
                onVerify={() => handleVerify(proposal)}
                onDismiss={() => dismissProposal(proposal.id)}
              />
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}

function TriggerButton({
  status,
  canTrigger,
  onStart,
  onAbort,
}: {
  status: ReturnType<typeof useOptimizerStream>["state"]["status"];
  canTrigger: boolean;
  onStart: () => void;
  onAbort: () => void;
}) {
  if (status === "streaming") {
    return (
      <Button variant="default" onClick={onAbort}>
        {t`Stop`}
      </Button>
    );
  }
  return (
    <Button
      variant="filled"
      onClick={onStart}
      disabled={!canTrigger}
      leftSection={<Icon name="sparkles" />}
    >
      {status === "idle" ? t`Suggest optimizations` : t`Re-analyze`}
    </Button>
  );
}

/**
 * Pull the current native SQL off a transform so the proposal card can diff
 * against it. Handles two on-the-wire shapes for the same thing:
 *   - legacy `DatasetQuery`:  source.query.native.query  (string)
 *   - new MBQL stages:        source.query.stages[i].native  where
 *                             the stage's `lib/type` is "mbql.stage/native"
 *
 * We don't rely on a `type` discriminator because `DatasetQuery` is
 * declared opaque to TS — those fields exist on the wire but are hidden
 * from the type system.
 */
function getNativeSql(transform: Transform): string | null {
  const source = transform.source as unknown as {
    type?: string;
    query?: {
      native?: { query?: unknown };
      stages?: Array<{ "lib/type"?: string; native?: unknown }>;
    };
  };
  if (source?.type === "python") {
    return null;
  }
  const query = source?.query;
  if (!query) {
    return null;
  }

  // Legacy: { native: { query: "..." } }
  const legacy = query.native?.query;
  if (typeof legacy === "string" && legacy.trim().length > 0) {
    return legacy;
  }

  // New MBQL stages: pick the first native stage.
  if (Array.isArray(query.stages)) {
    const nativeStage = query.stages.find(
      (s) => s?.["lib/type"] === "mbql.stage/native",
    );
    const stageSql = nativeStage?.native;
    if (typeof stageSql === "string" && stageSql.trim().length > 0) {
      return stageSql;
    }
  }

  return null;
}

/**
 * Walk `depends_on` from the chosen proposal back through every ancestor and
 * return ids in roots-first order (matching the accept-endpoint contract).
 *
 * The server rejects the whole request if any referenced id is missing
 * from the cache, so a missing ancestor in the client state is dropped
 * here — the user will see a 404 with the offending ids if that ever
 * happens.
 */
function topoOrderForAccept(
  target: Proposal,
  available: Proposal[],
): string[] {
  const byId = new Map(available.map((p) => [p.id, p]));
  const visited = new Set<string>();
  const order: string[] = [];

  const visit = (id: string) => {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const node = byId.get(id);
    if (!node) {
      return;
    }
    for (const depId of node.depends_on) {
      visit(depId);
    }
    order.push(id);
  };

  visit(target.id);
  return order;
}

function reportVerify(
  data: VerifyResponse | undefined,
  ok: ReturnType<typeof useMetadataToasts>["sendSuccessToast"],
  fail: ReturnType<typeof useMetadataToasts>["sendErrorToast"],
) {
  if (!data) {
    return;
  }
  if ("error" in data) {
    fail(t`Verification failed: ${data.error}`);
    return;
  }
  if (data.equivalent) {
    ok(
      t`Verified equivalent — slow ${data.slow_duration_ms} ms vs fast ${data.fast_duration_ms} ms`,
    );
  } else {
    fail(t`Results diverged — ${data.diff_rows} rows differ`);
  }
}
