import { t } from "ttag";

import { Flex, Pill, Text } from "metabase/ui";
import type {
  UsageMetadataCandidatePresentation,
  UsageMetadataCandidateType,
  UsageMetadataPredicateKind,
} from "metabase-types/api";

import S from "./CandidatePills.module.css";

type CandidatePillsProps = {
  candidateType: UsageMetadataCandidateType;
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
      className={S.pill}
      data-kind={kind}
      title={label}
      aria-label={`${getKindLabel(kind)}: ${label}`}
    >
      {label}
    </Pill>
  );
}

function getKindLabel(kind: UsageMetadataPredicateKind) {
  switch (kind) {
    case "boolean":
      return t`Boolean predicate`;
    case "category":
      return t`Category predicate`;
    case "number":
      return t`Number predicate`;
    case "temporal":
      return t`Time predicate`;
    case "other":
      return t`Predicate`;
  }
}
