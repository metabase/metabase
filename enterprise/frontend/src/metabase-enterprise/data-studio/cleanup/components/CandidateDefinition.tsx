import { useMemo } from "react";
import { t } from "ttag";

import { SegmentEditor } from "metabase/data-studio/segments/components/SegmentEditor";
import { MeasureAggregationPicker } from "metabase/querying/measures";
import { SegmentFilterEditor } from "metabase/querying/segments";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  IconName,
  UsageMetadataCandidateSummary,
} from "metabase-types/api";

const CONDITIONAL_MEASURE_OPERATORS = new Set([
  "count-where",
  "distinct-where",
  "sum-where",
]);

type CandidateDefinitionProps = {
  candidate: UsageMetadataCandidateSummary;
};

export function flattenAndConditions(
  condition: Lib.ExpressionParts,
): Lib.ExpressionParts[] {
  if (condition.operator !== "and") {
    return [condition];
  }

  const flattenedConditions: Lib.ExpressionParts[] = [];
  for (const arg of condition.args) {
    if (!Lib.isExpressionParts(arg)) {
      return [condition];
    }
    flattenedConditions.push(...flattenAndConditions(arg));
  }
  return flattenedConditions;
}

function getConditionalMeasureQuery(query: Lib.Query) {
  const [aggregation] = Lib.aggregations(query, -1);
  if (!aggregation) {
    return undefined;
  }

  const aggregationParts = Lib.expressionParts(query, -1, aggregation);
  if (!CONDITIONAL_MEASURE_OPERATORS.has(aggregationParts.operator)) {
    return undefined;
  }

  const condition = aggregationParts.args.at(-1);
  if (!condition || !Lib.isExpressionParts(condition)) {
    return undefined;
  }

  return flattenAndConditions(condition).reduce(
    (filterQuery, filterParts) =>
      Lib.filter(filterQuery, -1, Lib.expressionClause(filterParts)),
    query,
  );
}

function CandidateMeasureDefinition({ query }: { query: Lib.Query }) {
  const conditionalMeasureQuery = useMemo(
    () => getConditionalMeasureQuery(query),
    [query],
  );

  return (
    <Card withBorder p="xl">
      <Stack gap="xl">
        <MeasureAggregationPicker
          query={query}
          onChange={() => undefined}
          readOnly
        />
        {conditionalMeasureQuery && (
          <Stack gap="sm">
            <Text fw="bold">{t`Where`}</Text>
            <SegmentFilterEditor
              query={conditionalMeasureQuery}
              onChange={() => undefined}
              readOnly
            />
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

export function CandidateDefinition({ candidate }: CandidateDefinitionProps) {
  const metadata = useSelector(getMetadata);
  const query = useMemo(() => {
    const databaseId = candidate.definition.database;
    if (!databaseId) {
      return undefined;
    }

    return Lib.fromJsQuery(
      Lib.metadataProvider(databaseId, metadata),
      candidate.definition,
    );
  }, [candidate.definition, metadata]);

  if (!query) {
    return null;
  }

  return candidate.candidate_type === "measure" ? (
    <CandidateMeasureDefinition query={query} />
  ) : (
    <SegmentEditor
      query={query}
      description=""
      readOnly
      onQueryChange={() => undefined}
      onDescriptionChange={() => undefined}
    />
  );
}

export function getCandidateIcon(
  candidate: Pick<UsageMetadataCandidateSummary, "candidate_type">,
): IconName {
  return candidate.candidate_type === "measure" ? "ruler" : "segment";
}
