import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import {
  Card,
  Code,
  Flex,
  Icon,
  type IconName,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import { computeCardResult } from "metabase-enterprise/transforms/lib/inspector";
import type { InspectorCard } from "metabase-types/api";

import { useCardResultsContext } from "./LensContent";

type JoinAnalysisSectionProps = {
  cards: InspectorCard[];
};

const JOIN_ICONS: Record<string, IconName> = {
  "left-join": "join_left_outer",
  "right-join": "join_right_outer",
  "inner-join": "join_inner",
  "full-join": "join_full_outer",
};

const JOIN_LABELS: Record<string, string> = {
  "left-join": "Left Join",
  "right-join": "Right Join",
  "inner-join": "Inner Join",
  "full-join": "Full Join",
};

export const JoinAnalysisSection = ({ cards }: JoinAnalysisSectionProps) => {
  // Separate cards by type
  const baseCountCard = cards.find(
    (c) => c.metadata?.card_type === "base-count" || c.id === "base-count",
  );
  const joinStepCards = cards.filter(
    (c) =>
      c.metadata?.card_type === "join-step" || c.id.startsWith("join-step-"),
  );
  const tableCountCards = cards.filter(
    (c) => c.metadata?.card_type === "table-count" || c.id.startsWith("table-"),
  );

  return (
    <Stack gap="md">
      {baseCountCard && <BaseCountDisplay card={baseCountCard} />}
      {joinStepCards.length > 0 && (
        <JoinStepsTable
          joinStepCards={joinStepCards}
          tableCountCards={tableCountCards}
        />
      )}
    </Stack>
  );
};

const BaseCountDisplay = ({ card }: { card: InspectorCard }) => {
  const { data, isLoading } = useGetAdhocQueryQuery(card.dataset_query);
  const value = data?.data?.rows?.[0]?.[0];

  return (
    <Flex gap="sm" align="center">
      <Text fw={500}>{t`Base row count:`}</Text>
      {isLoading ? (
        <Loader size="xs" />
      ) : (
        <Text>
          {typeof value === "number" ? value.toLocaleString() : String(value)}
        </Text>
      )}
    </Flex>
  );
};

type JoinStepsTableProps = {
  joinStepCards: InspectorCard[];
  tableCountCards: InspectorCard[];
};

const JoinStepsTable = ({
  joinStepCards,
  tableCountCards,
}: JoinStepsTableProps) => {
  // Sort by join step
  const sortedCards = useMemo(
    () =>
      [...joinStepCards].sort((a, b) => {
        const stepA = (a.metadata?.join_step as number) ?? 0;
        const stepB = (b.metadata?.join_step as number) ?? 0;
        return stepA - stepB;
      }),
    [joinStepCards],
  );

  return (
    <Stack gap="sm">
      {sortedCards.map((card) => {
        const tableCard = tableCountCards.find(
          (tc) => tc.metadata?.join_step === card.metadata?.join_step,
        );
        return (
          <JoinStepRow key={card.id} stepCard={card} tableCard={tableCard} />
        );
      })}
    </Stack>
  );
};

type JoinStepRowProps = {
  stepCard: InspectorCard;
  tableCard?: InspectorCard;
};

const JoinStepRow = ({ stepCard, tableCard }: JoinStepRowProps) => {
  const { lensId, setCardResult } = useCardResultsContext();
  const { data: stepData, isLoading: isStepLoading } = useGetAdhocQueryQuery(
    stepCard.dataset_query,
  );
  const { data: tableData, isLoading: isTableLoading } = useGetAdhocQueryQuery(
    tableCard?.dataset_query ?? { type: "native", native: { query: "" } },
    { skip: !tableCard },
  );

  const alias = (stepCard.metadata?.join_alias as string) ?? "Unknown";
  const strategy = (stepCard.metadata?.join_strategy as string) ?? "left-join";

  const rows = stepData?.data?.rows;
  const tableCount = tableData?.data?.rows?.[0]?.[0] as number | undefined;

  const isLoading = isStepLoading || (tableCard && isTableLoading);

  // Compute derived fields using lens-specific logic from cljc
  const cardResult = useMemo(() => {
    if (!rows) {
      return null;
    }
    return computeCardResult(lensId, stepCard, rows);
  }, [lensId, stepCard, rows]);

  const outputCount = cardResult?.["output-count"] as number | undefined;
  const matchedCount = cardResult?.["matched-count"] as number | undefined;
  const nullCount = cardResult?.["null-count"] as number | null;
  const nullRate = cardResult?.["null-rate"] as number | null;

  // Report results to context for trigger evaluation
  useEffect(() => {
    if (!isLoading && cardResult) {
      setCardResult(stepCard.id, cardResult);
    }
  }, [
    isLoading,
    cardResult,
    stepCard.id,
    setCardResult,
  ]);

  return (
    <Card p="sm" shadow="none" withBorder>
      <Flex gap="lg" align="center" wrap="wrap">
        <Flex gap="xs" align="center" miw={150}>
          <Tooltip label={JOIN_LABELS[strategy] ?? strategy}>
            <Icon name={JOIN_ICONS[strategy] ?? "join_left_outer"} c="brand" />
          </Tooltip>
          <Code bg="transparent">{alias}</Code>
        </Flex>

        {isLoading ? (
          <Loader size="xs" />
        ) : (
          <>
            <Flex gap="xs" align="center">
              <Text size="sm" c="text-secondary">{t`Output:`}</Text>
              <Text size="sm" fw={500}>
                {outputCount?.toLocaleString() ?? "-"}
              </Text>
            </Flex>

            {matchedCount != null && (
              <Flex gap="xs" align="center">
                <Text size="sm" c="text-secondary">{t`Matched:`}</Text>
                <Text size="sm" fw={500}>
                  {matchedCount.toLocaleString()}
                </Text>
              </Flex>
            )}

            {tableCount != null && (
              <Flex gap="xs" align="center">
                <Text size="sm" c="text-secondary">{t`Table rows:`}</Text>
                <Text size="sm" fw={500}>
                  {tableCount.toLocaleString()}
                </Text>
              </Flex>
            )}

            {nullRate != null && nullRate > 0.05 && (
              <Tooltip
                label={t`${nullCount?.toLocaleString()} rows (${Math.round(nullRate * 100)}%) have NULL join keys`}
              >
                <Flex gap="xs" align="center">
                  <Icon
                    name="warning"
                    c={nullRate > 0.2 ? "error" : "warning"}
                    size={16}
                  />
                  <Text
                    size="sm"
                    c={nullRate > 0.2 ? "error" : "warning"}
                  >{t`${Math.round(nullRate * 100)}% unmatched`}</Text>
                </Flex>
              </Tooltip>
            )}
          </>
        )}
      </Flex>
    </Card>
  );
};
