import { QueryClauseDisplay } from "metabase/data-studio/components/RevisionHistory/QueryClauseDisplay";
import type {
  IconName,
  UsageMetadataCandidateSummary,
} from "metabase-types/api";

type CandidateDefinitionProps = {
  candidate: UsageMetadataCandidateSummary;
};

export function CandidateDefinition({ candidate }: CandidateDefinitionProps) {
  return (
    <QueryClauseDisplay
      definition={candidate.definition}
      tableId={candidate.table.id}
      clauseType={
        candidate.candidate_type === "measure" ? "aggregations" : "filters"
      }
    />
  );
}

export function getCandidateIcon(
  candidate: Pick<UsageMetadataCandidateSummary, "candidate_type">,
): IconName {
  return candidate.candidate_type === "measure" ? "ruler" : "segment";
}
