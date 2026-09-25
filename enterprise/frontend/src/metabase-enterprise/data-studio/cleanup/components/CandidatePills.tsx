import { t } from "ttag";

import { Flex, Pill, Text } from "metabase/ui";
import type {
  UsageMetadataCandidatePresentation,
  UsageMetadataPredicateKind,
} from "metabase-types/api";

import type { UsageMetadataCreationCandidateType } from "../utils";

import S from "./CandidatePills.module.css";

type CandidatePillsProps = {
  candidateType: UsageMetadataCreationCandidateType;
  presentation: UsageMetadataCandidatePresentation;
};

export function CandidatePills({
  candidateType,
  presentation,
}: CandidatePillsProps) {
  const hasPredicates = presentation.predicates.length > 0;

  return (
    <Flex gap="xs" wrap="wrap" align="center" miw={0}>
      {candidateType === "measure" && presentation.aggregation != null && (
        <Text component="span" fw="bold" className={S.aggregation}>
          {presentation.aggregation.display_name}
        </Text>
      )}
      {candidateType === "measure" && hasPredicates && (
        <Text
          component="span"
          c="text-secondary"
          fw="normal"
          className={S.aggregation}
        >
          {t`where`}
        </Text>
      )}
      {presentation.predicates.map((predicate) => (
        <CandidatePill
          key={predicate.signature}
          label={predicate.display_name}
          kind={predicate.kind}
        />
      ))}
    </Flex>
  );
}

function CandidatePill({
  label,
  kind,
}: {
  label: string;
  kind: UsageMetadataPredicateKind;
}) {
  return (
    <Pill
      size="sm"
      className={S.pill}
      data-kind={kind}
      title={label}
      aria-label={getCandidatePillAriaLabel(kind, label)}
    >
      {label}
    </Pill>
  );
}

export function getCandidatePillAriaLabel(
  kind: UsageMetadataPredicateKind,
  label: string,
) {
  switch (kind) {
    case "boolean":
      return t`Boolean predicate: ${label}`;
    case "category":
      return t`Category predicate: ${label}`;
    case "number":
      return t`Number predicate: ${label}`;
    case "temporal":
      return t`Time predicate: ${label}`;
    case "other":
      return t`Predicate: ${label}`;
  }
}
