import { useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { ReadOnlyFilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { getTranslatedFilterDisplayName } from "metabase/querying/filters/utils/display";
import { ReadOnlyMeasureAggregationPicker } from "metabase/querying/measures";
import { ReadOnlyClauseStep } from "metabase/querying/notebook/components/ClauseStep";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Badge, Card, Group, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  IconName,
  UsageMetadataCandidateDetail,
  UsageMetadataCandidateSummary,
} from "metabase-types/api";

const CONDITIONAL_MEASURE_OPERATORS = new Set([
  "count-where",
  "distinct-where",
  "sum-where",
]);

type CandidateDefinitionProps = {
  candidate: UsageMetadataCandidateDetail;
};

export function CandidateFilterDefinition({ query }: { query: Lib.Query }) {
  const tc = useTranslateContent();
  const { locale } = useLocale();
  const filters = useMemo(() => Lib.filters(query, -1), [query]);
  const renderFilterName = useMemo(
    () => (filter: Lib.FilterClause) =>
      getTranslatedFilterDisplayName(query, -1, filter, tc, locale),
    [locale, query, tc],
  );

  return (
    <ErrorBoundary>
      <ReadOnlyClauseStep
        items={filters}
        mode="inspectable"
        color="core-filter"
        renderName={renderFilterName}
        renderPopover={({ item: filter, index, onClose }) => (
          <ReadOnlyFilterPicker
            query={query}
            stageIndex={-1}
            filter={filter}
            filterIndex={index}
            onClose={onClose}
          />
        )}
      />
    </ErrorBoundary>
  );
}

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
        <ReadOnlyMeasureAggregationPicker query={query} />
        {conditionalMeasureQuery && (
          <Stack gap="sm">
            <Text fw="bold">{t`Where`}</Text>
            <CandidateFilterDefinition query={conditionalMeasureQuery} />
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
        <ReadOnlyMeasureAggregationPicker query={query} />
        {hasFilters && (
          <Stack gap="sm">
            <Text fw="bold">{t`Where`}</Text>
            <CandidateFilterDefinition query={query} />
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
    if (
      candidate.candidate_type === "table" ||
      !("database" in candidate.definition)
    ) {
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
        <Card withBorder p="xl">
          <CandidateFilterDefinition query={query} />
        </Card>
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
