import { useMemo, useState } from "react";
import { t } from "ttag";

import { MultiSelect, SimpleGrid, Stack } from "metabase/ui";
import type {
  CardStats,
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import { interestingFields } from "metabase-lib/transforms-inspector";
import type {
  InspectorCard,
  InspectorLens,
  TransformInspectSource,
  TransformInspectVisitedFields,
} from "metabase-types/api";

import { ScalarCard } from "./ScalarCard";
import { VisualizationCard } from "./VisualizationCard";

type CardGroup = {
  groupId: string;
  inputCards: InspectorCard[];
  outputCards: InspectorCard[];
};

const parseTitleParts = (title: string): { field: string; table?: string } => {
  const match = title.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    return { field: match[1], table: match[2] };
  }
  return { field: title };
};

type ComparisonLayoutProps = {
  lens: InspectorLens;
  cards: InspectorCard[];
  alertsByCardId: Record<string, TriggeredAlert[]>;
  drillLensesByCardId: Record<string, TriggeredDrillLens[]>;
  sources: TransformInspectSource[];
  visitedFields?: TransformInspectVisitedFields;
  onStatsReady: (cardId: string, stats: CardStats | null) => void;
  onDrill: (lens: TriggeredDrillLens) => void;
};

export const ComparisonLayout = ({
  lens,
  cards,
  alertsByCardId,
  drillLensesByCardId,
  sources,
  visitedFields,
  onStatsReady,
  onDrill,
}: ComparisonLayoutProps) => {
  const sourceOrderMap = useMemo(() => {
    const map = new Map<number | undefined, number>();
    for (let i = 0; i < sources.length; i++) {
      map.set(sources[i].table_id, i);
    }
    return map;
  }, [sources]);

  const groups = useMemo(() => {
    const groupMap = new Map<string, CardGroup>();

    for (const card of cards) {
      const metadata = card.metadata ?? {};
      const groupId = String(metadata.group_id ?? "default");
      const groupRole = metadata.group_role;

      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          groupId,
          inputCards: [],
          outputCards: [],
        });
      }

      const group = groupMap.get(groupId);
      if (group) {
        if (groupRole === "output") {
          group.outputCards.push(card);
        } else {
          group.inputCards.push(card);
        }
      }
    }

    for (const group of groupMap.values()) {
      group.inputCards.sort((a, b) => {
        const tableIdA = a.metadata?.table_id as number | undefined;
        const tableIdB = b.metadata?.table_id as number | undefined;
        const orderA = sourceOrderMap.get(tableIdA) ?? 999;
        const orderB = sourceOrderMap.get(tableIdB) ?? 999;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return (
          ((a.metadata?.group_order as number) ?? 0) -
          ((b.metadata?.group_order as number) ?? 0)
        );
      });
      group.outputCards.sort(
        (a, b) =>
          ((a.metadata?.group_order as number) ?? 0) -
          ((b.metadata?.group_order as number) ?? 0),
      );
    }

    return Array.from(groupMap.values());
  }, [cards, sourceOrderMap]);

  const columnOptions = useMemo(
    () =>
      groups
        .map((g) => ({
          value: g.groupId,
          label: g.groupId,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [groups],
  );

  const initialSelection = useMemo(() => {
    if (columnOptions.length === 1) {
      return [columnOptions[0].value];
    }

    const allFields = sources.flatMap((s) => s.fields ?? []);
    const scoredFields = interestingFields(allFields, visitedFields, {
      limit: 20,
    });
    const topFieldNames = new Set(scoredFields.map((f) => f.name));

    const groupsWithInterestingFields = groups.filter((g) =>
      g.inputCards.some((card) => {
        const { field } = parseTitleParts(card.title);
        return topFieldNames.has(field);
      }),
    );

    if (groupsWithInterestingFields.length > 0) {
      return groupsWithInterestingFields.slice(0, 5).map((g) => g.groupId);
    }

    return groups.slice(0, 5).map((g) => g.groupId);
  }, [columnOptions, groups, sources, visitedFields]);

  const [selectedColumns, setSelectedColumns] =
    useState<string[]>(initialSelection);

  const filteredGroups = useMemo(
    () => groups.filter((g) => selectedColumns.includes(g.groupId)),
    [groups, selectedColumns],
  );

  const renderCard = (card: InspectorCard) =>
    card.display === "scalar" ? (
      <ScalarCard
        key={card.id}
        lensId={lens.id}
        card={card}
        alerts={alertsByCardId[card.id] ?? []}
        drillLenses={drillLensesByCardId[card.id] ?? []}
        onStatsReady={onStatsReady}
        onDrill={onDrill}
      />
    ) : (
      <VisualizationCard
        key={card.id}
        lensId={lens.id}
        card={card}
        alerts={alertsByCardId[card.id] ?? []}
        drillLenses={drillLensesByCardId[card.id] ?? []}
        onStatsReady={onStatsReady}
        onDrill={onDrill}
      />
    );

  return (
    <Stack gap="lg">
      {groups.length > 1 && (
        <MultiSelect
          data={columnOptions}
          value={selectedColumns}
          onChange={setSelectedColumns}
          placeholder={t`Select columns to compare`}
          searchable
          clearable
        />
      )}
      {filteredGroups.map((group) => (
        <SimpleGrid key={group.groupId} cols={2} spacing="md">
          <Stack gap="sm">{group.inputCards.map(renderCard)}</Stack>
          <Stack gap="sm">{group.outputCards.map(renderCard)}</Stack>
        </SimpleGrid>
      ))}
    </Stack>
  );
};
