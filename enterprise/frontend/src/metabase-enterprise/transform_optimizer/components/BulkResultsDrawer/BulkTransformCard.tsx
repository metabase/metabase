import { useMemo, useState } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import { useGetTransformQuery } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Anchor,
  Badge,
  Card,
  Divider,
  Group,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import {
  type AcceptMode,
  type BulkOptimizeDoneEntry,
  type VerifyResponse,
  useAcceptProposalMutation,
  useVerifyProposalMutation,
} from "../../api";
import type { Proposal } from "../../types";
import { ProposalCard } from "../ProposalCard";
import {
  getNativeSql,
  groupProposalsByDependency,
  reportVerify,
  resolveDependencyNames,
  topoOrderForAccept,
} from "../TransformOptimizerSection/TransformOptimizerSection";
import { ProposalGroup } from "../TransformOptimizerSection/ProposalGroup";

type Props = {
  entry: BulkOptimizeDoneEntry;
  /**
   * Index names that have already been accepted somewhere in this bulk
   * batch — index proposals matching one of these are auto-dismissed
   * from this card so the user doesn't see the same `CREATE INDEX`
   * twice across transforms that share a hot table.
   */
  acceptedIndexNames: Set<string>;
  /**
   * Called when this card accepts an index proposal so other cards can
   * dedup against it. The `indexName` is `ddl_statement.index_name`,
   * which the BE assigns at validation time.
   */
  onIndexAccepted: (indexName: string) => void;
};

/**
 * One transform's slice of the bulk-optimize drawer. Reuses the exact same
 * `<ProposalCard>` the detail page renders — verify and accept hit the
 * existing endpoints, and the bulk-optimize BE already populated the
 * proposal cache so they resolve without re-running the LLM.
 *
 * Local-only state:
 *   - `dismissed` — proposals the user accepted or dismissed in this
 *     drawer session. We don't mutate the bulk-status BE state; we just
 *     hide them on the client so the card empties out naturally.
 *   - `busyProposalId` — which proposal's button should show a spinner.
 */
export function BulkTransformCard({
  entry,
  acceptedIndexNames,
  onIndexAccepted,
}: Props) {
  const { transform, summary, proposals, optimization_degree } = entry;
  // The bulk endpoint doesn't return the compiled SQL — fetch the full
  // Transform object so ProposalCard can render a line-diff instead of
  // the raw proposed body. RTK Query will hit the cache populated by the
  // transforms list query without a network round-trip in the common case.
  const { data: fullTransform } = useGetTransformQuery(transform.id);
  const currentSql = fullTransform ? getNativeSql(fullTransform) : null;
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [verify, verifyResult] = useVerifyProposalMutation();
  const [accept, acceptResult] = useAcceptProposalMutation();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);

  const visibleProposals = useMemo(
    () =>
      proposals.filter((p) => {
        if (dismissed.has(p.id)) {
          return false;
        }
        // Drop any index proposal whose physical index has already been
        // accepted by another card in this batch — accepting again would
        // just hit `IF NOT EXISTS` and clutter the UI.
        const idxName = p.ddl_statement?.index_name;
        if (idxName && acceptedIndexNames.has(idxName)) {
          return false;
        }
        return true;
      }),
    [proposals, dismissed, acceptedIndexNames],
  );

  const dismissOne = (id: string) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const handleVerify = async (proposal: Proposal) => {
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
  };

  const handleAccept = async (proposal: Proposal, mode: AcceptMode = "new") => {
    // Replace mode only touches the original transform — never pull
    // ancestor precomputes into the accept set.
    const proposalIds =
      mode === "replace"
        ? [proposal.id]
        : topoOrderForAccept(proposal, visibleProposals);
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
      sendSuccessToast(t`Replaced source of "${data.replaced_transform.name}"`);
    } else {
      const created = data?.created_transforms ?? [];
      if (created.length > 0) {
        sendSuccessToast(
          created.length === 1
            ? t`New transform "${created[0].name}" created`
            : c("Bulk drawer accept toast, {0} is a count")
                .t`${created.length} new transforms created`,
        );
      } else {
        sendSuccessToast(t`Index changes applied`);
      }
    }
    for (const id of proposalIds) {
      dismissOne(id);
      // Tell sibling cards this index is now installed so they drop their
      // duplicate. Non-index proposals have no `index_name` so the check
      // is a cheap no-op for rewrites / precomputes.
      const accepted = proposals.find((p) => p.id === id);
      const idxName = accepted?.ddl_statement?.index_name;
      if (idxName) {
        onIndexAccepted(idxName);
      }
    }
  };

  const isOptimized = optimization_degree === 100;
  const allDismissed =
    visibleProposals.length === 0 && proposals.length > 0;

  return (
    <Card withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={2} miw={0} style={{ flex: 1 }}>
            <Anchor
              component={Link}
              to={Urls.transformRun(transform.id)}
              fw="bold"
            >
              {transform.name}
            </Anchor>
            {summary && (
              <Text c="text-secondary" fz="sm">
                {summary}
              </Text>
            )}
          </Stack>
          <Badge
            color={isOptimized || allDismissed ? "success" : "brand"}
            variant={isOptimized || allDismissed ? "light" : "filled"}
          >
            {isOptimized
              ? t`Fully optimized`
              : allDismissed
                ? t`Triaged`
                : c("Proposal count badge in bulk results")
                    .t`${visibleProposals.length} suggestion(s)`}
          </Badge>
        </Group>

        {visibleProposals.length > 0 && (
          <>
            <Divider />
            <Stack gap="md">
              {groupProposalsByDependency(visibleProposals).map((group) => (
                <ProposalGroup
                  key={group.key}
                  proposals={group.proposals}
                  renderCard={(proposal) => {
                    const canVerify = proposal.kind !== "index";
                    const dependencyNames = resolveDependencyNames(
                      proposal,
                      visibleProposals,
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
                        onDismiss={() => dismissOne(proposal.id)}
                      />
                    );
                  }}
                />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}
