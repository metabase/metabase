import { useMemo } from "react";
import { t } from "ttag";

import { SegmentEditor } from "metabase/data-studio/segments/components/SegmentEditor";
import { MeasureAggregationPicker } from "metabase/querying/measures";
import { SegmentFilterEditor } from "metabase/querying/segments";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Badge, Card, Group, Stack, Text } from "metabase/ui";
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
              detailedFilterNames
              inspectableFilters
            />
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function CandidateMetricDefinition({ query }: { query: Lib.Query }) {
  const hasFilters = Lib.filters(query, -1).length > 0;
  const breakouts = Lib.breakouts(query, -1);

  return (
    <Card withBorder p="xl">
      <Stack gap="xl">
        <MeasureAggregationPicker
          query={query}
          onChange={() => undefined}
          readOnly
        />
        {hasFilters && (
          <Stack gap="sm">
            <Text fw="bold">{t`Where`}</Text>
            <SegmentFilterEditor
              query={query}
              onChange={() => undefined}
              readOnly
              detailedFilterNames
              inspectableFilters
            />
          </Stack>
        )}
        {breakouts.length > 0 && (
          <Stack gap="sm">
            <Text fw="bold">{t`Grouped by`}</Text>
            <Group>
              {breakouts.map((breakout, index) => (
                <Badge key={index} variant="light">
                  {Lib.displayInfo(query, -1, breakout).longDisplayName}
                </Badge>
              ))}
            </Group>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

export function CandidateDefinition({ candidate }: CandidateDefinitionProps) {
  const metadata = useSelector(getMetadata);
  const query = useMemo(() => {
    if (candidate.candidate_type === "table") {
      return undefined;
    }
    const databaseId = candidate.definition.database;
    if (!databaseId) {
      return undefined;
    }

    return Lib.fromJsQuery(
      Lib.metadataProvider(databaseId, metadata),
      candidate.definition,
    );
  }, [candidate.candidate_type, candidate.definition, metadata]);

  if (!query) {
    return null;
  }

  switch (candidate.candidate_type) {
    case "measure":
      return <CandidateMeasureDefinition query={query} />;
    case "metric":
      return <CandidateMetricDefinition query={query} />;
    case "segment":
      return (
        <SegmentEditor
          query={query}
          description=""
          readOnly
          detailedFilterNames
          inspectableFilters
          onQueryChange={() => undefined}
          onDescriptionChange={() => undefined}
        />
      );
    case "table":
      return null;
  }
}

export function getCandidateIcon(
  candidate: Pick<UsageMetadataCandidateSummary, "candidate_type">,
): IconName {
  switch (candidate.candidate_type) {
    case "table":
      return "table";
    case "metric":
      return "metric";
    case "measure":
      return "ruler";
    case "segment":
      return "segment";
  }
}
