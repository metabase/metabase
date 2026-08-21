import { useMemo } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Group,
  Icon,
  Text,
  Tooltip,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type { UsageMetadataCandidateSummary } from "metabase-types/api";

import { isCreationCandidate } from "../utils";

import { getCandidateIcon } from "./CandidateDefinition";
import { CandidatePills } from "./CandidatePills";
import { EvidenceBadges } from "./EvidenceBadges";

type CandidateTableProps = {
  candidates: UsageMetadataCandidateSummary[];
  selectedCandidateId?: number;
  isMutating: boolean;
  onOpen: (candidate: UsageMetadataCandidateSummary) => void;
  onDismiss: (candidate: UsageMetadataCandidateSummary) => void;
  onScrollEnd?: () => void;
};

export function CandidateTable({
  candidates,
  selectedCandidateId,
  isMutating,
  onOpen,
  onDismiss,
  onScrollEnd,
}: CandidateTableProps) {
  const columns = useMemo<TreeTableColumnDef<UsageMetadataCandidateSummary>[]>(
    () => [
      {
        id: "recommendation",
        header: t`Recommendation`,
        minWidth: 460,
        cell: ({ row }) => {
          const candidate = row.original;
          return (
            <Group
              gap="sm"
              wrap="nowrap"
              miw={0}
              w="100%"
              data-testid={`cleanup-candidate-content-${candidate.id}`}
            >
              <Icon
                name={getCandidateIcon(candidate)}
                c="text-secondary"
                aria-label={getCandidateTypeLabel(candidate.candidate_type)}
              />
              {isCreationCandidate(candidate) ? (
                <CandidatePills
                  candidateType={candidate.candidate_type}
                  presentation={candidate.presentation}
                />
              ) : (
                <Text fw="bold" truncate>
                  {candidate.display_name}
                </Text>
              )}
            </Group>
          );
        },
      },
      {
        id: "signals",
        header: t`Signals`,
        width: 210,
        cell: ({ row }) => <CandidateSignals candidate={row.original} />,
      },
      {
        id: "sources",
        header: t`Used by`,
        width: 100,
        cell: ({ row }) => (
          <Text c="text-secondary">
            {t`${row.original.evidence.distinct_source_count} sources`}
          </Text>
        ),
      },
      {
        id: "actions",
        width: 48,
        cell: ({ row }) => {
          const candidate = row.original;
          if (candidate.modeling_status === "modeled" || candidate.dismissed) {
            return null;
          }
          return (
            <Tooltip label={t`Dismiss suggestion`}>
              <ActionIcon
                variant="subtle"
                aria-label={t`Dismiss suggestion`}
                disabled={isMutating}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onDismiss(candidate);
                }}
              >
                <Icon name="close" />
              </ActionIcon>
            </Tooltip>
          );
        },
      },
    ],
    [isMutating, onDismiss],
  );
  const treeTableInstance = useTreeTableInstance({
    data: candidates,
    columns,
    getNodeId: (candidate) => String(candidate.id),
    selectedRowId:
      selectedCandidateId == null ? null : String(selectedCandidateId),
    defaultRowHeight: 52,
    onRowActivate: (row) => onOpen(row.original),
  });

  return (
    <TreeTable
      instance={treeTableInstance}
      hierarchical={false}
      ariaLabel={t`Cleanup recommendations`}
      styles={{
        row: { height: "auto", minHeight: "3.25rem" },
        cell: { whiteSpace: "normal" },
      }}
      getRowProps={(row) => ({
        "data-testid": `cleanup-candidate-${row.original.id}`,
        "data-selected": row.original.id === selectedCandidateId || undefined,
        "aria-label": row.original.display_name,
      })}
      onRowClick={(row) => onOpen(row.original)}
      onScrollEnd={onScrollEnd}
    />
  );
}

function getCandidateTypeLabel(
  candidateType: UsageMetadataCandidateSummary["candidate_type"],
) {
  switch (candidateType) {
    case "table":
      return t`Table`;
    case "metric":
      return t`Metric`;
    case "measure":
      return t`Measure`;
    case "segment":
      return t`Segment`;
  }
}

function CandidateSignals({
  candidate,
}: {
  candidate: UsageMetadataCandidateSummary;
}) {
  const { evidence } = candidate;
  return (
    <EvidenceBadges
      verified={evidence.verified_source_count > 0}
      official={evidence.official_source_count > 0}
      popular={evidence.popular_source_count > 0}
    />
  );
}
