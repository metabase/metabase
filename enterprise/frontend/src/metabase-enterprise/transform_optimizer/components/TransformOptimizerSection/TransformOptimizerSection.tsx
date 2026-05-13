import { useCallback, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Transform } from "metabase-types/api";

import {
  type AcceptMode,
  type VerifyResponse,
  useAcceptProposalMutation,
  useVerifyProposalMutation,
} from "../../api";
import { useOptimizerStream } from "../../hooks/use-optimizer-stream";
import type { Proposal } from "../../types";
import { OptimizationDegreeDial } from "../OptimizationDegreeDial";
import { ProposalCard } from "../ProposalCard";
import { TargetIndexesSection } from "../TargetIndexesSection";

import { ProposalGroup } from "./ProposalGroup";
import { SonicOptimizedBanner } from "./SonicOptimizedBanner";

type Props = {
  transform: Transform;
  readOnly?: boolean;
};

export function TransformOptimizerSection({ transform, readOnly }: Props) {
  const dispatch = useDispatch();
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
    async (proposal: Proposal, mode: AcceptMode = "new") => {
      // Replace mode is single-proposal: never drag ancestors in,
      // since `update-transform!` only touches the original transform.
      const proposalIds =
        mode === "replace"
          ? [proposal.id]
          : topoOrderForAccept(proposal, state.proposals);
      setBusyProposalId(proposal.id);
      const { data, error } = await accept({
        transformId: transform.id,
        proposalIds,
        mode,
      });
      setBusyProposalId(null);
      if (error) {
        sendErrorToast(t`Failed to accept proposal`);
        return;
      }
      if (data && "replaced_transform" in data) {
        // Replace mode: the user is already on this transform's page —
        // navigating to it would be a no-op. Just a confirmation toast.
        sendSuccessToast(
          t`Replaced source of "${data.replaced_transform.name}"`,
        );
      } else {
        const created = data?.created_transforms ?? [];
        if (created.length > 0) {
          // Open the *leaf* of the created set — for a single rewrite
          // that's the only one; for a precompute DAG it's the final
          // proposal the user clicked, which is the one whose result
          // they care about.
          const leaf = created[created.length - 1];
          sendSuccessToast(
            created.length === 1
              ? t`New transform "${leaf.name}" created`
              : t`${created.length} new transforms created — leaf: "${leaf.name}"`,
            () => dispatch(push(Urls.transform(leaf.id))),
            t`Open`,
          );
        } else {
          sendSuccessToast(t`Index changes applied`);
        }
      }
      // Remove every proposal we just accepted from the list.
      for (const id of proposalIds) {
        dismissProposal(id);
      }
    },
    [
      accept,
      transform.id,
      state.proposals,
      sendErrorToast,
      sendSuccessToast,
      dismissProposal,
      dispatch,
    ],
  );

  const isLoading = state.status === "loading";
  const isDone = state.status === "done";
  const isErrored = state.status === "error";
  const isInSessionOptimized =
    isDone && state.optimizationDegree === 100 && state.proposals.length === 0;
  // Render the Sonic banner whenever the optimizer's verdict — either
  // persisted on the transform from a prior run, or from this session — is
  // "fully optimized" and there's nothing currently in flight to contradict
  // it. Re-analyze flips it back if the new run finds proposals.
  const showOptimizedBanner =
    !isLoading &&
    state.proposals.length === 0 &&
    (isInSessionOptimized || transform.optimized === true);
  const canTrigger = !isLoading;

  return (
    <Stack p="lg" gap="md">
      {showOptimizedBanner ? (
        <SonicOptimizedBanner
          summary={state.summary}
          onReanalyze={handleStart}
        />
      ) : (
        <>
          <Group
            justify="space-between"
            align="flex-start"
            gap="lg"
            wrap="nowrap"
          >
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

          {(isLoading || isDone || isErrored) && (
            <Stack gap="md">
              {!isErrored && (
                <OptimizationDegreeDial
                  status={isLoading ? "streaming" : "done"}
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
                {groupProposalsByDependency(state.proposals).map((group) => (
                  <ProposalGroup
                    key={group.key}
                    proposals={group.proposals}
                    renderCard={(proposal) => {
                      const canVerify = proposal.kind !== "index";
                      const dependencyNames = resolveDependencyNames(
                        proposal,
                        state.proposals,
                      );
                      return (
                        <ProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          currentSql={currentSql}
                          dependencyNames={dependencyNames}
                          actions={{
                            accept: {
                              kind: "accept",
                              busy:
                                busyProposalId === proposal.id &&
                                acceptResult.isLoading,
                              disabled: readOnly,
                              disabledReason: readOnly
                                ? t`You don't have permission to create transforms here.`
                                : undefined,
                            },
                            verify: canVerify
                              ? {
                                  kind: "verify",
                                  busy:
                                    busyProposalId === proposal.id &&
                                    verifyResult.isLoading,
                                }
                              : undefined,
                            dismiss: { kind: "dismiss" },
                          }}
                          onAccept={(mode) => handleAccept(proposal, mode)}
                          onVerify={() => handleVerify(proposal)}
                          onDismiss={() => dismissProposal(proposal.id)}
                        />
                      );
                    }}
                  />
                ))}
              </Stack>
            </Stack>
          )}
        </>
      )}

      <Divider />
      <TargetIndexesSection transform={transform} readOnly={readOnly} />
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
  if (status === "loading") {
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
 *
 * Exception: a `:index` proposal whose DDL targets `source-db` doesn't
 * actually need its `depends_on` ancestors to exist at accept time —
 * the index runs against tables that already exist in the source
 * database. The LLM sometimes tags those indices with `depends_on`
 * pointing at the rewrite they support (a *logical* link, not a
 * *materialisation* link). Topo-including the rewrite there would
 * silently accept the rewrite alongside, which is not what the user
 * asked for.
 */
export function topoOrderForAccept(
  target: Proposal,
  available: Proposal[],
): string[] {
  if (target.kind === "index" && target.ddl_statement?.target === "source-db") {
    return [target.id];
  }

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

type ProposalGroupShape = {
  /** Stable React key — concatenated, topo-ordered proposal ids. */
  key: string;
  /** Members of the group in topological (root-first) order. */
  proposals: Proposal[];
};

/**
 * Walk the `depends_on` edges (as undirected) and split proposals into
 * connected components. Each component is one "pipeline" — a precompute
 * + its rewrite leaf, a rewrite + its supporting index, etc. — that
 * the user accepts as a whole or breaks apart by `Dismiss`-ing parts.
 *
 * Within a component, proposals are returned in topological (root-first)
 * order so the UI naturally reads top-to-bottom along the
 * "build precompute → consume in rewrite" flow.
 *
 * Components are returned in input order of their first-seen proposal,
 * which preserves the LLM's emit order across the panel.
 */
export function groupProposalsByDependency(
  proposals: Proposal[],
): ProposalGroupShape[] {
  // Union-find over the undirected depends_on graph.
  const parent = new Map<string, string>();
  for (const p of proposals) {
    parent.set(p.id, p.id);
  }
  const find = (id: string): string => {
    let cur = id;
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!;
      parent.set(cur, parent.get(p)!);
      cur = parent.get(cur)!;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(ra, rb);
    }
  };
  const ids = new Set(proposals.map((p) => p.id));
  for (const p of proposals) {
    for (const dep of p.depends_on) {
      if (ids.has(dep)) {
        union(p.id, dep);
      }
    }
  }

  // Bucket each proposal under its root, preserving emit order.
  const buckets = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const root = find(p.id);
    const bucket = buckets.get(root) ?? [];
    bucket.push(p);
    buckets.set(root, bucket);
  }

  // Topo-sort each bucket (roots first).
  return Array.from(buckets.values()).map((bucket) => {
    const byId = new Map(bucket.map((p) => [p.id, p]));
    const visited = new Set<string>();
    const ordered: Proposal[] = [];
    const visit = (id: string) => {
      if (visited.has(id)) {
        return;
      }
      visited.add(id);
      const node = byId.get(id);
      if (!node) {
        return;
      }
      for (const dep of node.depends_on) {
        if (byId.has(dep)) {
          visit(dep);
        }
      }
      ordered.push(node);
    };
    for (const p of bucket) {
      visit(p.id);
    }
    return { key: ordered.map((p) => p.id).join("→"), proposals: ordered };
  });
}

/**
 * Resolve each id in `proposal.depends_on` against the current proposal
 * list. Returns `[{id, name}…]` so the card can render readable badges
 * rather than opaque ids. Missing ancestors (already dismissed,
 * unknown id) are dropped silently — the BE rejects accept calls that
 * reference missing proposals so the user will see an explicit error
 * if it matters.
 */
export function resolveDependencyNames(
  proposal: Proposal,
  available: Proposal[],
): Array<{ id: string; name: string }> {
  if (!proposal.depends_on || proposal.depends_on.length === 0) {
    return [];
  }
  const byId = new Map(available.map((p) => [p.id, p]));
  return proposal.depends_on
    .map((id) => {
      const dep = byId.get(id);
      return dep ? { id: dep.id, name: dep.name } : null;
    })
    .filter((x): x is { id: string; name: string } => x !== null);
}

export function reportVerify(
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
