import { t } from "ttag";

import type {
  JevCardCollectionKind,
  JevCreateKind,
} from "metabase/api/jev-create";
import type { JevPaletteSelections } from "metabase/querying/jev-filters/types";
import type { CardId, TableId } from "metabase-types/api";

import type { JevQuestionChoices } from "./question-query";
import {
  type JevCreateRow,
  getDashboardRows,
  getDefaultKind,
  getKindRow,
  getQuestionChoices,
  getQuestionRows,
  getSelectedCardIds,
  getTableOptions,
  getTableRow,
} from "./rows";
import {
  type JevDashboardPlanState,
  type JevIntentResult,
  type JevQuestionPlanState,
  getQuestionTable,
} from "./use-jev-create-plans";
import type { JevTableQuery } from "./use-load-jev-table-query";

/** What the user changed from Jev's picks, for one intent. */
export interface JevCreateChoices {
  kind?: JevCreateKind;
  tableId?: TableId;
  questionSelections: Partial<Record<TableId, JevPaletteSelections>>;
  /** Include/Skip picks, per kind: a document and a dashboard have their own plans. */
  cardSelections: Partial<Record<JevCardCollectionKind, JevPaletteSelections>>;
}

export const NO_CHOICES: JevCreateChoices = {
  questionSelections: {},
  cardSelections: {},
};

export type CreateAction =
  | { type: "wait" }
  | { type: "none" }
  | { type: "question"; tableQuery: JevTableQuery; choices: JevQuestionChoices }
  | {
      type: "cards";
      kind: JevCardCollectionKind;
      name: string;
      cardIds: CardId[];
    };

interface ViewState {
  kind: JevCreateKind;
  tableId: TableId | null;
  rows: JevCreateRow[];
  notice: string | null;
  isLoadingPlan: boolean;
  latencyMs: number;
  createAction: CreateAction;
}

function getQuestionView(
  intent: JevIntentResult,
  tableId: TableId | null,
  planState: JevQuestionPlanState | undefined,
  selections: JevPaletteSelections,
): Pick<ViewState, "rows" | "notice" | "latencyMs" | "createAction"> {
  const tableRow = getTableRow(getTableOptions(intent.response), tableId);
  const intentLatencyMs = intent.response.jev_ms ?? intent.response.elapsed_ms;
  if (tableId == null) {
    return {
      rows: [tableRow],
      notice: t`No table fits — try naming what you want to see`,
      latencyMs: intentLatencyMs,
      createAction: { type: "none" },
    };
  }
  if (planState == null || planState.status === "loading") {
    return {
      rows: [tableRow],
      notice: null,
      latencyMs: intentLatencyMs,
      createAction: { type: "wait" },
    };
  }
  if (planState.status === "error") {
    return {
      rows: [tableRow],
      notice: t`Couldn't plan a question on this table`,
      latencyMs: intentLatencyMs,
      createAction: { type: "none" },
    };
  }
  const { plan, tableQuery } = planState;
  return {
    rows: [
      tableRow,
      ...getQuestionRows(plan, tableQuery.columnsByKey, selections),
    ],
    notice:
      plan.status === "unavailable" ? t`Jev is unavailable right now` : null,
    latencyMs: plan.jev_ms ?? plan.elapsed_ms,
    createAction: {
      type: "question",
      tableQuery,
      choices: getQuestionChoices(plan, tableQuery.columnsByKey, selections),
    },
  };
}

function getCardCollectionView(
  intent: JevIntentResult,
  kind: JevCardCollectionKind,
  planState: JevDashboardPlanState | undefined,
  selections: JevPaletteSelections,
): Pick<ViewState, "rows" | "notice" | "latencyMs" | "createAction"> {
  const intentLatencyMs = intent.response.jev_ms ?? intent.response.elapsed_ms;
  if (planState == null || planState.status === "loading") {
    return {
      rows: [],
      notice: null,
      latencyMs: intentLatencyMs,
      createAction: { type: "wait" },
    };
  }
  if (planState.status === "error") {
    return {
      rows: [],
      notice: t`Jev is unavailable right now`,
      latencyMs: intentLatencyMs,
      createAction: { type: "none" },
    };
  }
  const { plan } = planState;
  const latencyMs = plan.jev_ms ?? plan.elapsed_ms;
  if (plan.cards.length === 0) {
    return {
      rows: [],
      notice: t`No existing questions on these tables`,
      latencyMs,
      createAction: { type: "none" },
    };
  }
  const cardIds = getSelectedCardIds(plan, selections);
  const unavailableNotice =
    plan.status === "unavailable" ? t`Jev is unavailable right now` : null;
  const emptyNotice =
    kind === "dashboard"
      ? t`Include at least one question to create the dashboard`
      : t`Include at least one question to create the document`;
  return {
    rows: getDashboardRows(kind, plan, selections),
    notice: cardIds.length === 0 ? emptyNotice : unavailableNotice,
    latencyMs,
    createAction:
      cardIds.length > 0
        ? { type: "cards", kind, name: plan.name, cardIds }
        : { type: "none" },
  };
}

export function getViewState(
  intent: JevIntentResult,
  choices: JevCreateChoices,
  questionPlans: ReadonlyMap<TableId, JevQuestionPlanState>,
  dashboardPlans: Partial<Record<JevCardCollectionKind, JevDashboardPlanState>>,
): ViewState {
  const { response } = intent;
  const kind = choices.kind ?? getDefaultKind(response);
  const tableId =
    choices.tableId ?? getQuestionTable(response.tables)?.id ?? null;
  const kindRow = getKindRow(response, kind);
  const view =
    kind === "question"
      ? getQuestionView(
          intent,
          tableId,
          tableId != null ? questionPlans.get(tableId) : undefined,
          (tableId != null ? choices.questionSelections[tableId] : null) ?? {},
        )
      : getCardCollectionView(
          intent,
          kind,
          dashboardPlans[kind],
          choices.cardSelections[kind] ?? {},
        );
  return {
    kind,
    tableId,
    ...view,
    rows: [kindRow, ...view.rows],
    isLoadingPlan: view.createAction.type === "wait",
  };
}

function getIntentNotice(intent: JevIntentResult): string | null {
  switch (intent.response.status) {
    case "ok":
      return null;
    case "no-tables":
      return t`There are no tables to build on`;
    case "unavailable":
      return t`Jev is unavailable right now`;
  }
}

export function getIntentLatencyMs(intent: JevIntentResult | null) {
  return intent
    ? (intent.response.jev_ms ?? intent.response.elapsed_ms)
    : undefined;
}

interface GetNoticeOpts {
  text: string;
  intent: JevIntentResult | null;
  viewNotice: string | null;
  failedKind: JevCardCollectionKind | null;
}

export function getNotice({
  text,
  intent,
  viewNotice,
  failedKind,
}: GetNoticeOpts): string | null {
  if (text === "") {
    return t`For example: “orders in Texas last quarter by month as a line chart”, “a sales overview dashboard” or “a write-up of last quarter's sales”`;
  }
  if (failedKind === "dashboard") {
    return t`Couldn't create the dashboard`;
  }
  if (failedKind === "document") {
    return t`Couldn't create the document`;
  }
  return (intent && getIntentNotice(intent)) ?? viewNotice;
}
