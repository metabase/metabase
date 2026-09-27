import { t } from "ttag";

import type {
  JevCardCollectionKind,
  JevCreateIntent,
  JevCreateIntentTable,
  JevCreateKind,
  JevDashboardPlan,
  JevQuestionPlan,
  JevRanked,
} from "metabase/api/jev-create";
import { getColumnIcon } from "metabase/common/utils/columns";
import type { JevQuestionColumnsByKey } from "metabase/querying/jev-filters/question-utils";
import type {
  JevPaletteRow,
  JevPaletteSelections,
} from "metabase/querying/jev-filters/types";
import {
  getAppliedFilters,
  getDefaultSelection,
  getNoChangeIndex,
  getSelection,
  mergeRows,
} from "metabase/querying/jev-filters/utils";
import { getIconForVisualizationType } from "metabase/viz-core";
import type { CardId, IconName, TableId } from "metabase-types/api";

import type { JevQuestionChoices } from "./question-query";

export const MAX_TABLE_OPTIONS = 5;

export interface JevCreateOption {
  label: string;
  probability?: number;
  icon?: IconName;
}

/** What a row sets, so a selection can be routed to the right piece of state. */
export type JevCreateRowTarget =
  | { type: "kind"; kinds: JevCreateKind[] }
  | { type: "table"; tables: JevCreateIntentTable[] }
  | { type: "question" }
  | { type: "dashboard-name" }
  | { type: "card" };

export interface JevCreateRow {
  id: string;
  name: string;
  icon: IconName;
  detail?: string;
  options: JevCreateOption[];
  selectedIndex: number;
  /** An option to show as Jev's (unselected) pick. */
  ghostIndex?: number;
  target: JevCreateRowTarget;
}

const KIND_ORDER: JevCreateKind[] = ["question", "dashboard", "document"];

export function getDefaultKind(intent: JevCreateIntent): JevCreateKind {
  return intent.kind?.choice ?? "question";
}

export function getKindRow(
  intent: JevCreateIntent,
  kind: JevCreateKind,
): JevCreateRow {
  const labels: Record<JevCreateKind, string> = {
    question: t`Question`,
    dashboard: t`Dashboard`,
    document: t`Document`,
  };
  const icons: Record<JevCreateKind, IconName> = {
    question: "insight",
    dashboard: "dashboard",
    document: "document",
  };
  return {
    id: "kind",
    name: t`Create`,
    icon: "add",
    options: KIND_ORDER.map((option) => ({
      label: labels[option],
      icon: icons[option],
      probability: intent.kind?.probabilities[option],
    })),
    selectedIndex: KIND_ORDER.indexOf(kind),
    target: { type: "kind", kinds: KIND_ORDER },
  };
}

export function getTableOptions(
  intent: JevCreateIntent,
): JevCreateIntentTable[] {
  return intent.tables.slice(0, MAX_TABLE_OPTIONS);
}

export function getTableRow(
  tables: JevCreateIntentTable[],
  tableId: TableId | null,
): JevCreateRow {
  return {
    id: "table",
    name: t`Table`,
    icon: "table",
    options: tables.map((table) => ({
      label: table.display_name,
      probability: table.probability,
    })),
    selectedIndex: tables.findIndex((table) => table.id === tableId),
    target: { type: "table", tables },
  };
}

function getFilterRows(
  plan: JevQuestionPlan,
  columnsByKey: JevQuestionColumnsByKey,
): JevPaletteRow[] {
  return mergeRows([], plan.filters, (suggestion) => {
    const entry = columnsByKey.get(suggestion.parameter_id);
    return {
      id: suggestion.parameter_id,
      name: entry?.info.display_name ?? suggestion.parameter_name,
      icon: entry ? getColumnIcon(entry.column) : "filter",
    };
  });
}

function toFilterRow(
  row: JevPaletteRow,
  selections: JevPaletteSelections,
): JevCreateRow {
  const noChangeIndex = getNoChangeIndex(row);
  const selectedIndex = getSelection(row, selections);
  const isGhostPick =
    getDefaultSelection(row) === noChangeIndex &&
    selectedIndex === noChangeIndex;
  return {
    id: row.id,
    name: row.name,
    icon: row.icon ?? "filter",
    options: [
      ...row.options.map(({ label, probability }) => ({ label, probability })),
      { label: t`No change` },
    ],
    selectedIndex,
    ghostIndex: isGhostPick ? 0 : undefined,
    target: { type: "question" },
  };
}

function getRankedSelection<T>(
  ranked: JevRanked<T>,
  selections: JevPaletteSelections,
  rowId: string,
) {
  const index = selections[rowId] ?? 0;
  return ranked.options[index] ?? ranked.options[0];
}

function toRankedRow<T>(
  id: string,
  name: string,
  icon: IconName,
  ranked: JevRanked<T>,
  selections: JevPaletteSelections,
): JevCreateRow {
  return {
    id,
    name,
    icon,
    options: ranked.options.map(({ label, probability }) => ({
      label,
      probability,
    })),
    selectedIndex: Math.min(selections[id] ?? 0, ranked.options.length - 1),
    target: { type: "question" },
  };
}

const AGGREGATION_ROW_ID = "aggregation";
const BREAKOUT_ROW_ID = "breakout";
const TEMPORAL_UNIT_ROW_ID = "temporal-unit";
const DISPLAY_ROW_ID = "display";

function isDateBreakout(
  plan: JevQuestionPlan,
  columnsByKey: JevQuestionColumnsByKey,
  selections: JevPaletteSelections,
) {
  const breakout = getRankedSelection(
    plan.breakout,
    selections,
    BREAKOUT_ROW_ID,
  );
  const entry =
    breakout.column_key != null
      ? columnsByKey.get(breakout.column_key)
      : undefined;
  return entry?.info.kind === "date";
}

export function getQuestionRows(
  plan: JevQuestionPlan,
  columnsByKey: JevQuestionColumnsByKey,
  selections: JevPaletteSelections,
): JevCreateRow[] {
  const filterRows = getFilterRows(plan, columnsByKey).map((row) =>
    toFilterRow(row, selections),
  );
  const temporalUnitRows = isDateBreakout(plan, columnsByKey, selections)
    ? [
        toRankedRow(
          TEMPORAL_UNIT_ROW_ID,
          t`Time grouping`,
          "calendar",
          plan.temporal_unit,
          selections,
        ),
      ]
    : [];
  return [
    ...filterRows,
    toRankedRow(
      AGGREGATION_ROW_ID,
      t`Summarize`,
      "sum",
      plan.aggregation,
      selections,
    ),
    toRankedRow(
      BREAKOUT_ROW_ID,
      t`Group by`,
      "group",
      plan.breakout,
      selections,
    ),
    ...temporalUnitRows,
    toRankedRow(
      DISPLAY_ROW_ID,
      t`Visualization`,
      "line",
      plan.display,
      selections,
    ),
  ];
}

export function getQuestionChoices(
  plan: JevQuestionPlan,
  columnsByKey: JevQuestionColumnsByKey,
  selections: JevPaletteSelections,
): JevQuestionChoices {
  const unit = isDateBreakout(plan, columnsByKey, selections)
    ? getRankedSelection(plan.temporal_unit, selections, TEMPORAL_UNIT_ROW_ID)
        .unit
    : "default";
  return {
    filters: getAppliedFilters(getFilterRows(plan, columnsByKey), selections),
    aggregation: getRankedSelection(
      plan.aggregation,
      selections,
      AGGREGATION_ROW_ID,
    ),
    breakout: getRankedSelection(plan.breakout, selections, BREAKOUT_ROW_ID),
    temporalUnit: unit,
    display: getRankedSelection(plan.display, selections, DISPLAY_ROW_ID)
      .display,
  };
}

const INCLUDE_INDEX = 0;
const SKIP_INDEX = 1;

function getCardRowId(cardId: CardId) {
  return `card-${cardId}`;
}

function getCardSelection(
  card: JevDashboardPlan["cards"][number],
  selections: JevPaletteSelections,
) {
  return (
    selections[getCardRowId(card.card_id)] ??
    (card.selected ? INCLUDE_INDEX : SKIP_INDEX)
  );
}

/** Rows for a dashboard or document built from existing questions. */
export function getDashboardRows(
  kind: JevCardCollectionKind,
  plan: JevDashboardPlan,
  selections: JevPaletteSelections,
): JevCreateRow[] {
  const nameRow: JevCreateRow = {
    id: "dashboard-name",
    name: t`Name`,
    icon: kind,
    options: [{ label: plan.name }],
    selectedIndex: 0,
    target: { type: "dashboard-name" },
  };
  const cardRows = plan.cards.map(
    (card): JevCreateRow => ({
      id: getCardRowId(card.card_id),
      name: card.name,
      icon: card.display
        ? getIconForVisualizationType(card.display).name
        : "insight",
      detail: card.collection_name ?? undefined,
      options: [
        { label: t`Include`, probability: card.probability },
        { label: t`Skip` },
      ],
      selectedIndex: getCardSelection(card, selections),
      target: { type: "card" },
    }),
  );
  return [nameRow, ...cardRows];
}

export function getSelectedCardIds(
  plan: JevDashboardPlan,
  selections: JevPaletteSelections,
): CardId[] {
  return plan.cards
    .filter((card) => getCardSelection(card, selections) === INCLUDE_INDEX)
    .map((card) => card.card_id);
}

export function cycleIndex(row: JevCreateRow, delta: 1 | -1): number {
  const count = row.options.length;
  return (row.selectedIndex + delta + count) % count;
}
