import { useMemo, useState } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

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
  groupProposalsByDependency,
  reportVerify,
  resolveDependencyNames,
  topoOrderForAccept,
} from "../TransformOptimizerSection/TransformOptimizerSection";
import { ProposalGroup } from "../TransformOptimizerSection/ProposalGroup";

type Props = {
  entry: BulkOptimizeDoneEntry;
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
export function BulkTransformCard({ entry }: Props) {
  const { transform, summary, proposals, optimization_degree } = entry;
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [verify, verifyResult] = useVerifyProposalMutation();
  const [accept, acceptResult] = useAcceptProposalMutation();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);

  const visibleProposals = useMemo(
    () => proposals.filter((p) => !dismissed.has(p.id)),
    [proposals, dismissed],
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
