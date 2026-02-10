import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  Card,
  Stack,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type { InspectorCard } from "metabase-types/api";

import { useLensContentContext } from "../../LensContent/LensContentContext";

import { AlertSubRow } from "./components/AlertSubRow";
import { DrillLensesCell } from "./components/DrillLensesCell";
import { JoinHeaderCell } from "./components/JoinHeaderCell";
import { JoinNameCell } from "./components/JoinNameCell";
import { JoinStepStatCell } from "./components/JoinStepStatCell";
import { TableCountCard } from "./components/TableCountCard";
import type { JoinTableRow } from "./types";
import { getMaxSeverity } from "./utils";

type JoinAnalysisSectionProps = {
  cards: InspectorCard[];
};

export const JoinAnalysisSection = ({ cards }: JoinAnalysisSectionProps) => {
  const {
    alertsByCardId,
    lens,
    drillLensesByCardId,
    collectedCardStats,
    onStatsReady,
    onDrill,
  } = useLensContentContext();

  const { joinStepCards, tableCountCards } = useMemo(
    () => ({
      joinStepCards: cards.filter((c) => c.id.startsWith("join-step-")),
      tableCountCards: cards.filter((c) => /^table-.*-count$/.test(c.id)),
    }),
    [cards],
  );

  const treeData = useMemo<JoinTableRow[]>(() => {
    const sortedCards = _.sortBy(
      joinStepCards,
      (card) => card.metadata?.join_step,
    );
    return sortedCards.map((card) => {
      const tableCard = tableCountCards.find(
        ({ metadata }) => metadata?.join_step === metadata?.join_step,
      );
      const alerts = alertsByCardId[card.id] ?? [];
      return {
        id: card.id,
        card,
        tableCard,
        joinAlias: t`${String(card.metadata?.join_alias ?? "Unknown")}`,
        joinStrategy: String(card.metadata?.join_strategy ?? "left-join"),
        alerts,
        severity: alerts.length > 0 ? getMaxSeverity(alerts) : null,
        drillLenses: drillLensesByCardId[card.id] ?? [],
        cardStats: collectedCardStats[card.id],
      };
    });
  }, [
    joinStepCards,
    tableCountCards,
    alertsByCardId,
    drillLensesByCardId,
    collectedCardStats,
  ]);

  const hasDrills = useMemo(
    () => treeData.some((row) => row.drillLenses.length > 0),
    [treeData],
  );

  const columns = useMemo(
    () =>
      _.compact<(TreeTableColumnDef<JoinTableRow> | false)[]>([
        {
          id: "alert",
          width: 42,
          cell: ({ row }) => (
            <JoinHeaderCell
              lens={lens}
              card={row.original.card}
              severity={row.original.severity}
              onStatsReady={onStatsReady}
              onToggleAlerts={() => row.toggleExpanded()}
            />
          ),
        },
        {
          id: "name",
          header: t`Join`,
          width: "auto",
          maxWidth: 436,
          accessorFn: (original) => original.joinAlias,
          cell: ({ row }) => (
            <JoinNameCell
              joinAlias={row.original.joinAlias}
              joinStrategy={row.original.joinStrategy}
            />
          ),
        },
        {
          id: "output",
          header: t`Output`,
          width: "auto",
          cell: ({ row }) => (
            <JoinStepStatCell
              cardStats={row.original.cardStats}
              statKey="output_count"
            />
          ),
        },
        {
          id: "matched",
          header: t`Matched`,
          width: "auto",
          cell: ({ row }) => (
            <JoinStepStatCell
              cardStats={row.original.cardStats}
              statKey="matched_count"
            />
          ),
        },
        {
          id: "table-rows-count",
          header: t`Table rows`,
          width: "auto",
          cell: ({ row }) =>
            row.original.tableCard ? (
              <TableCountCard
                lens={lens}
                card={row.original.tableCard}
                onStatsReady={onStatsReady}
              />
            ) : null,
        },
        hasDrills && {
          id: "drills",
          width: "auto",
          header: () => null,
          accessorFn: (original) =>
            original.drillLenses.length > 0 ? original.drillLenses : null,
          cell: ({ row }) => (
            <DrillLensesCell
              drillLenses={row.original.drillLenses}
              onDrill={onDrill}
            />
          ),
        },
      ]),
    [hasDrills, onDrill, onStatsReady, lens],
  );

  const instance = useTreeTableInstance({
    data: treeData,
    columns,
    getNodeId: (node) => node.id,
    enableSorting: false,
  });

  const joinsCount = treeData.length;

  return (
    <Stack gap="md">
      {joinsCount > 0 && (
        <>
          <Title order={4}>
            {ngettext(
              msgid`${joinsCount} join`,
              `${joinsCount} joins`,
              joinsCount,
            )}
          </Title>
          <Card p={0} shadow="none" withBorder>
            <TreeTable
              instance={instance}
              hierarchical={false}
              styles={{
                cell: { padding: "var(--mantine-spacing-sm)" },
                headerCell: { padding: "var(--mantine-spacing-sm)" },
              }}
              renderSubRow={(row) => {
                if (!row.getIsExpanded()) {
                  return null;
                }
                return (
                  <AlertSubRow
                    alerts={row.original.alerts}
                    severity={row.original.severity}
                  />
                );
              }}
            />
          </Card>
        </>
      )}
    </Stack>
  );
};
