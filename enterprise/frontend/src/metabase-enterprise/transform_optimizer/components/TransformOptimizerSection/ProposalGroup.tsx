import type { ReactNode } from "react";
import { ngettext, msgid } from "ttag";

import { Badge, Box, Group, Icon, Text } from "metabase/ui";

import type { Proposal } from "../../types";

import S from "./ProposalGroup.module.css";

type Props = {
  /** Members of one dependency component, root-first. */
  proposals: Proposal[];
  /**
   * Card renderer. The group wraps each card in a positional `<Box>`
   * so a vertical connector line can be drawn between consecutive
   * steps. The parent supplies the actual `ProposalCard` so this
   * component stays UI-only.
   */
  renderCard: (proposal: Proposal) => ReactNode;
};

/**
 * One pipeline of dependent proposals — a precompute and the rewrite
 * that reads from it, a rewrite and a supporting transform-target
 * index, etc. Standalone proposals (1-member groups) render flat with
 * no wrapper chrome so we don't add visual noise.
 */
export function ProposalGroup({ proposals, renderCard }: Props) {
  if (proposals.length === 1) {
    // Single-proposal "group": render the card directly. The user
    // shouldn't pay any visual cost for a non-pipeline proposal.
    return <>{renderCard(proposals[0])}</>;
  }

  const stepCount = proposals.length;
  return (
    <Box className={S.group} aria-label="Proposal pipeline">
      <Group className={S.header} gap="xs">
        <Icon name="link" />
        <Text fw="bold" fz="sm">
          {ngettext(
            msgid`Pipeline (${stepCount} step)`,
            `Pipeline (${stepCount} steps)`,
            stepCount,
          )}
        </Text>
        <Badge variant="default" size="sm" radius="sm">
          {labelForLeaf(proposals[proposals.length - 1])}
        </Badge>
      </Group>
      <Box className={S.pipeline}>
        {proposals.map((proposal) => (
          <Box key={proposal.id} className={S.step}>
            {renderCard(proposal)}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function labelForLeaf(leaf: Proposal): string {
  // The leaf's kind tells the user what the *whole* pipeline ultimately
  // does — a precompute-and-rewrite pipeline ends in a rewrite, etc.
  switch (leaf.kind) {
    case "rewrite":
      return "ends in rewrite";
    case "index":
      return "ends in index";
    case "precompute":
      return "ends in precompute";
  }
}
