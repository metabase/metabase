import { useCallback, useRef, useState } from "react";
import _ from "underscore";

import {
  type JevCardCollectionKind,
  type JevCreateIntent,
  type JevCreateIntentTable,
  type JevDashboardPlan,
  type JevQuestionPlan,
  useGetJevCreateIntentMutation,
  useGetJevDashboardPlanMutation,
  useGetJevQuestionPlanMutation,
} from "metabase/api/jev-create";
import type { TableId } from "metabase-types/api";

import {
  type JevTableQuery,
  useLoadJevTableQuery,
} from "./use-load-jev-table-query";

/** Below this, no table plausibly fits a single question, so none is planned up front. */
export const MIN_QUESTION_TABLE_PROBABILITY = 0.1;
export const MIN_DASHBOARD_TABLE_RELEVANCE = 0.5;
export const MIN_DASHBOARD_TABLES = 3;
export const MAX_DASHBOARD_TABLES = 5;
export const CARD_COLLECTION_KINDS: JevCardCollectionKind[] = [
  "dashboard",
  "document",
];

export interface JevIntentResult {
  requestId: number;
  text: string;
  response: JevCreateIntent;
}

export type JevQuestionPlanState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; tableQuery: JevTableQuery; plan: JevQuestionPlan };

export type JevDashboardPlanState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; plan: JevDashboardPlan };

const UNAVAILABLE_INTENT: JevCreateIntent = {
  status: "unavailable",
  elapsed_ms: 0,
  kind: null,
  tables: [],
};

export function getQuestionTable(
  tables: readonly JevCreateIntentTable[],
): JevCreateIntentTable | null {
  const [top] = tables;
  return top && top.probability >= MIN_QUESTION_TABLE_PROBABILITY ? top : null;
}

/**
 * Tables for a dashboard or document on the topic: the relevant ones, topped up
 * by relevance to a few (the most relevant table may have no saved questions),
 * capped at a handful.
 */
export function getDashboardTableIds(
  tables: readonly JevCreateIntentTable[],
): TableId[] {
  const byRelevance = _.sortBy(tables, (table) => -table.relevance);
  const relevantCount = byRelevance.filter(
    (table) => table.relevance >= MIN_DASHBOARD_TABLE_RELEVANCE,
  ).length;
  const count = Math.min(
    Math.max(relevantCount, MIN_DASHBOARD_TABLES),
    MAX_DASHBOARD_TABLES,
  );
  return byRelevance.slice(0, count).map((table) => table.id);
}

/**
 * Jev's three steps for "New with Jev": the intent for the typed text, then
 * both plans fired as soon as it arrives so switching between question and
 * dashboard is instant. Responses for older text are dropped.
 */
export function useJevCreatePlans() {
  const [getIntent] = useGetJevCreateIntentMutation();
  const [getQuestionPlan] = useGetJevQuestionPlanMutation();
  const [getDashboardPlan] = useGetJevDashboardPlanMutation();
  const loadTableQuery = useLoadJevTableQuery();

  const [intent, setIntent] = useState<JevIntentResult | null>(null);
  const [isFetchingIntent, setIsFetchingIntent] = useState(false);
  const [questionPlans, setQuestionPlans] = useState<
    ReadonlyMap<TableId, JevQuestionPlanState>
  >(new Map());
  const [dashboardPlans, setDashboardPlans] = useState<
    Partial<Record<JevCardCollectionKind, JevDashboardPlanState>>
  >({});
  const latestRequestIdRef = useRef(0);
  const lastRequestedTextRef = useRef("");

  const requestQuestionPlan = useCallback(
    async (
      requestId: number,
      text: string,
      table: Pick<JevCreateIntentTable, "id" | "display_name">,
    ) => {
      const setPlan = (state: JevQuestionPlanState) => {
        if (requestId === latestRequestIdRef.current) {
          setQuestionPlans((plans) => new Map(plans).set(table.id, state));
        }
      };
      setPlan({ status: "loading" });
      try {
        const tableQuery = await loadTableQuery(table.id);
        if (!tableQuery) {
          setPlan({ status: "error" });
          return;
        }
        const plan = await getQuestionPlan({
          text,
          table_id: table.id,
          table_name: table.display_name,
          columns: Array.from(
            tableQuery.columnsByKey.values(),
            (entry) => entry.info,
          ),
        }).unwrap();
        setPlan({ status: "ready", tableQuery, plan });
      } catch {
        setPlan({ status: "error" });
      }
    },
    [loadTableQuery, getQuestionPlan],
  );

  const requestDashboardPlan = useCallback(
    async (
      requestId: number,
      text: string,
      tableIds: TableId[],
      kind: JevCardCollectionKind,
    ) => {
      const setPlan = (state: JevDashboardPlanState) => {
        if (requestId === latestRequestIdRef.current) {
          setDashboardPlans((plans) => ({ ...plans, [kind]: state }));
        }
      };
      setPlan({ status: "loading" });
      try {
        const plan = await getDashboardPlan({
          text,
          table_ids: tableIds,
          kind,
        }).unwrap();
        setPlan({ status: "ready", plan });
      } catch {
        setPlan({ status: "error" });
      }
    },
    [getDashboardPlan],
  );

  const submit = useCallback(
    async (value: string) => {
      const text = value.trim();
      if (text === lastRequestedTextRef.current) {
        return;
      }
      lastRequestedTextRef.current = text;
      const requestId = ++latestRequestIdRef.current;
      setQuestionPlans(new Map());
      setDashboardPlans({});
      if (text === "") {
        setIntent(null);
        setIsFetchingIntent(false);
        return;
      }
      setIsFetchingIntent(true);
      const response = await getIntent({ text })
        .unwrap()
        .catch(() => UNAVAILABLE_INTENT);
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      setIsFetchingIntent(false);
      setIntent({ requestId, text, response });
      if (response.status !== "ok" || response.tables.length === 0) {
        return;
      }
      const questionTable = getQuestionTable(response.tables);
      if (questionTable) {
        requestQuestionPlan(requestId, text, questionTable);
      }
      const tableIds = getDashboardTableIds(response.tables);
      CARD_COLLECTION_KINDS.forEach((kind) =>
        requestDashboardPlan(requestId, text, tableIds, kind),
      );
    },
    [getIntent, requestQuestionPlan, requestDashboardPlan],
  );

  /** Plans a question on a table the user picked, unless it is already planned or in flight. */
  const planQuestionOn = useCallback(
    (table: JevCreateIntentTable) => {
      if (!intent || questionPlans.has(table.id)) {
        return;
      }
      requestQuestionPlan(intent.requestId, intent.text, table);
    },
    [intent, questionPlans, requestQuestionPlan],
  );

  return {
    intent,
    isFetchingIntent,
    questionPlans,
    dashboardPlans,
    submit,
    planQuestionOn,
  };
}
