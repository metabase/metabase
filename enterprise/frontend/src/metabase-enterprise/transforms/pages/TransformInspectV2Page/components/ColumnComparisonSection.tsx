import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, MultiSelect, SimpleGrid, Stack, Title } from "metabase/ui";
import type {
  InspectorV2Card,
  TransformInspectSource,
  TransformInspectTarget,
  TransformInspectVisitedFields,
} from "metabase-types/api";

import { InspectorCard } from "./InspectorCard";

type ColumnComparisonSectionProps = {
  cards: InspectorV2Card[];
  sources: TransformInspectSource[];
  target?: TransformInspectTarget;
  visitedFields?: TransformInspectVisitedFields;
};

type ComparisonGroup = {
  groupId: string;
  inputCards: InspectorV2Card[];
  outputCards: InspectorV2Card[];
};

export const ColumnComparisonSection = ({
  cards,
  sources,
  target,
  visitedFields,
}: ColumnComparisonSectionProps) => {
  // Group cards by group_id (output column name)
  const groups = useMemo(() => {
    const groupMap = new Map<string, ComparisonGroup>();

    for (const card of cards) {
      const metadata = card.metadata ?? {};
      const groupId = String(metadata.group_id ?? "default");
      const groupRole = metadata.group_role as "input" | "output" | undefined;

      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          groupId,
          inputCards: [],
          outputCards: [],
        });
      }

      const group = groupMap.get(groupId)!;
      if (groupRole === "output") {
        group.outputCards.push(card);
      } else {
        group.inputCards.push(card);
      }
    }

    // Sort cards within groups by group_order
    for (const group of groupMap.values()) {
      group.inputCards.sort(
        (a, b) =>
          ((a.metadata?.group_order as number) ?? 0) -
          ((b.metadata?.group_order as number) ?? 0),
      );
      group.outputCards.sort(
        (a, b) =>
          ((a.metadata?.group_order as number) ?? 0) -
          ((b.metadata?.group_order as number) ?? 0),
      );
    }

    return Array.from(groupMap.values());
  }, [cards]);

  // Get available column options for filter
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

  // Calculate initial selection based on visited fields
  const initialSelection = useMemo(() => {
    if (columnOptions.length === 1) {
      return [columnOptions[0].value];
    }

    if (visitedFields?.all && visitedFields.all.length > 0) {
      const visitedFieldIdSet = new Set(visitedFields.all);

      // Build field ID -> field name lookup from sources
      const fieldIdToName = new Map<number, string>();
      for (const source of sources) {
        for (const field of source.fields ?? []) {
          if (field.id) {
            fieldIdToName.set(field.id, field.name);
          }
        }
      }

      // Find groups where input cards reference visited fields
      const preselected = groups
        .filter((g) =>
          g.inputCards.some((card) => {
            const fieldId = card.metadata?.field_id as number | undefined;
            if (fieldId && visitedFieldIdSet.has(fieldId)) {
              return true;
            }
            // Also try matching by field name
            for (const [id, name] of fieldIdToName) {
              if (visitedFieldIdSet.has(id) && card.title.includes(name)) {
                return true;
              }
            }
            return false;
          }),
        )
        .map((g) => g.groupId);

      return preselected.length > 0 ? preselected : [];
    }

    return [];
  }, [columnOptions, groups, sources, visitedFields]);

  const [selectedColumns, setSelectedColumns] =
    useState<string[]>(initialSelection);

  const filteredGroups = useMemo(
    () => groups.filter((g) => selectedColumns.includes(g.groupId)),
    [groups, selectedColumns],
  );

  return (
    <Stack gap="lg">
      <MultiSelect
        data={columnOptions}
        value={selectedColumns}
        onChange={setSelectedColumns}
        placeholder={t`Select output columns to compare`}
        searchable
        clearable
      />

      {filteredGroups.length > 0 && (
        <Stack gap="md">
          <SimpleGrid cols={2} spacing="md">
            <Title order={4}>{t`Input`}</Title>
            <Title order={4}>{t`Output`}</Title>
          </SimpleGrid>
          <Stack gap="lg">
            {filteredGroups.map((group) => (
              <Stack
                key={group.groupId}
                gap="md"
                bg="background-tertiary"
                bd="1px solid var(--mb-color-border)"
                style={{ borderRadius: "var(--mb-radius-md)" }}
                p="md"
              >
                <SimpleGrid cols={2} spacing="md">
                  <Box>
                    {group.inputCards.map((card) => (
                      <InspectorCard key={card.id} card={card} showTitle />
                    ))}
                  </Box>
                  <Box>
                    {group.outputCards.map((card) => (
                      <InspectorCard key={card.id} card={card} showTitle />
                    ))}
                  </Box>
                </SimpleGrid>
              </Stack>
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
};
