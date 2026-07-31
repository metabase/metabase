import { t } from "ttag";

import { Flex, Pill } from "metabase/ui";
import type {
  UsageMetadataCandidatePresentation,
  UsageMetadataPredicateKind,
} from "metabase-types/api";

import S from "./CandidatePills.module.css";

type CandidatePillsProps = {
  presentation: UsageMetadataCandidatePresentation;
};

export function CandidatePills({ presentation }: CandidatePillsProps) {
  return (
    <Flex gap="xs" wrap="wrap" miw={0}>
      {presentation.aggregation != null && (
        <CandidatePill
          label={presentation.aggregation.display_name}
          kind="aggregation"
        />
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

type CandidatePillKind = UsageMetadataPredicateKind | "aggregation";

function CandidatePill({
  label,
  kind,
}: {
  label: string;
  kind: CandidatePillKind;
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

function getKindLabel(kind: CandidatePillKind) {
  switch (kind) {
    case "aggregation":
      return t`Aggregation`;
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
