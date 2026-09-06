/**
 * Canonical content factories — ports of the Cypress `H.create*` API helpers
 * (e2e/support/helpers/api/*). Consolidated from ~40 per-module copies that
 * had drifted apart; every module that used to carry its own copy now
 * re-exports from here so consumer imports stay unchanged.
 *
 * Each factory is a strict SUPERSET of the copies it replaced:
 * - the union of every copy's params and defaults;
 * - the follow-up-PUT logic the copies used (POST /api/card ignores
 *   enable_embedding / type=model|metric; POST /api/dashboard ignores
 *   enable_embedding / embedding_* / auto_apply_filters / dashcards — each
 *   needs a follow-up PUT);
 * - a superset return object for the *AndDashboard helpers, so every copy's
 *   return-destructuring (`{ id, card_id, dashboard_id }`, `{ dashboardId,
 *   dashcardId }`, `{ dashboard_id }`, and the bare-dashcard consumers) keeps
 *   working.
 *
 * Two contracts could NOT be reduced to a bare re-export and keep the same copy
 * behaviour, so their modules keep a one-line adapter over these:
 * - `filters-repros` defaults native-question `name` to "native" (everyone else
 *   "test question") — preserved by a wrapper injecting that default.
 * - `visualizer-basics` create{Question,NativeQuestion,Dashboard} return the raw
 *   `number` id — preserved by wrappers returning `.id`.
 */
import type { MetabaseApi } from "./api";
import { SAMPLE_DB_ID } from "./sample-data";

export type Card = { id: number; entity_id?: string } & Record<string, unknown>;
export type Dashboard = { id: number } & Record<string, unknown>;

export type StructuredQuestionDetails = {
  name?: string;
  type?: string;
  display?: string;
  database?: number;
  collection_id?: number | null;
  query?: Record<string, unknown>;
  /** click-behavior's createQuestion accepts a native query too. */
  native?: Record<string, unknown>;
  visualization_settings?: Record<string, unknown>;
  enable_embedding?: boolean;
  embedding_params?: Record<string, string> | null;
  parameters?: unknown[];
} & Record<string, unknown>;

export type NativeQuestionDetails = {
  name?: string;
  type?: string;
  display?: string;
  database?: number;
  collection_id?: number | null;
  native: Record<string, unknown>;
  visualization_settings?: Record<string, unknown>;
  enable_embedding?: boolean;
  embedding_params?: Record<string, string> | null;
  parameters?: unknown[];
} & Record<string, unknown>;

export type DashboardDetails = {
  name?: string;
  auto_apply_filters?: boolean;
  enable_embedding?: boolean;
  embedding_type?: string;
  embedding_params?: Record<string, string>;
  parameters?: unknown[];
  dashcards?: Record<string, unknown>[];
  tabs?: { id: string | number; name: string }[];
} & Record<string, unknown>;

export type DashCard = {
  id: number;
  card_id: number;
  dashboard_id: number;
} & Record<string, unknown>;

/** Superset return of the *AndDashboard helpers: the created dashcard, plus
 * every alias the various copies exposed. */
export type QuestionAndDashboardResult = DashCard & {
  questionId: number;
  cardId: number;
  dashboardId: number;
  dashcardId: number;
};

/** Apply the follow-up PUT /api/card the Cypress `question()` helper does:
 * POST /api/card ignores `type: model|metric` and `enable_embedding`. */
async function applyCardFollowUp(
  api: MetabaseApi,
  cardId: number,
  {
    type,
    enable_embedding,
    embedding_params,
  }: {
    type?: string;
    enable_embedding?: boolean;
    embedding_params?: Record<string, string> | null;
  },
) {
  if (type === "model" || type === "metric" || enable_embedding) {
    await api.put(`/api/card/${cardId}`, {
      type,
      ...(enable_embedding != null ? { enable_embedding } : {}),
      ...(embedding_params != null ? { embedding_params } : {}),
    });
  }
}

/**
 * Port of H.createQuestion (api/createQuestion.ts). Structured by default;
 * accepts a `native` query too (click-behavior's copy did). POST omits `type`
 * (the backend defaults it to "question"); model/metric and enable_embedding
 * are applied by a follow-up PUT.
 */
export async function createQuestion(
  api: MetabaseApi,
  details: StructuredQuestionDetails,
): Promise<Card> {
  const {
    name = "test question",
    type = "question",
    display = "table",
    database = SAMPLE_DB_ID,
    visualization_settings = {},
    query,
    native,
    enable_embedding,
    embedding_params,
    ...rest
  } = details;
  const dataset_query = native
    ? { type: "native", native, database }
    : { type: "query", query, database };
  const response = await api.post("/api/card", {
    name,
    display,
    visualization_settings,
    ...rest,
    dataset_query,
  });
  const card = (await response.json()) as Card;
  await applyCardFollowUp(api, card.id, {
    type,
    enable_embedding,
    embedding_params,
  });
  return card;
}

/** Port of H.createNativeQuestion (api/createNativeQuestion.ts). */
export async function createNativeQuestion(
  api: MetabaseApi,
  details: NativeQuestionDetails,
): Promise<Card> {
  const {
    name = "test question",
    type = "question",
    display = "table",
    database = SAMPLE_DB_ID,
    visualization_settings = {},
    native,
    enable_embedding,
    embedding_params,
    ...rest
  } = details;
  const response = await api.post("/api/card", {
    name,
    display,
    visualization_settings,
    ...rest,
    dataset_query: { type: "native", native, database },
  });
  const card = (await response.json()) as Card;
  await applyCardFollowUp(api, card.id, {
    type,
    enable_embedding,
    embedding_params,
  });
  return card;
}

/**
 * Port of H.createDashboard (api/createDashboard.ts). POST /api/dashboard
 * ignores enable_embedding / embedding_* / auto_apply_filters / dashcards — the
 * Cypress helper holds them back and applies them with a follow-up PUT, without
 * which the embed page renders "Embedding is not enabled for this object".
 */
export async function createDashboard(
  api: MetabaseApi,
  details: DashboardDetails = {},
): Promise<Dashboard> {
  const {
    name = "Test Dashboard",
    auto_apply_filters,
    enable_embedding,
    embedding_type,
    embedding_params,
    dashcards,
    ...rest
  } = details;
  const response = await api.post("/api/dashboard", { name, ...rest });
  let dashboard = (await response.json()) as Dashboard;

  if (
    enable_embedding != null ||
    auto_apply_filters != null ||
    Array.isArray(dashcards)
  ) {
    const put = await api.put(`/api/dashboard/${dashboard.id}`, {
      auto_apply_filters,
      enable_embedding,
      embedding_type,
      embedding_params,
      dashcards,
    });
    dashboard = (await put.json()) as Dashboard;
  }
  return dashboard;
}

function questionAndDashboardResult(
  dashcard: DashCard,
  card_id: number,
  dashboard_id: number,
): QuestionAndDashboardResult {
  return {
    ...dashcard,
    id: dashcard.id,
    card_id,
    dashboard_id,
    questionId: card_id,
    cardId: card_id,
    dashboardId: dashboard_id,
    dashcardId: dashcard.id,
  };
}

/** Port of H.createQuestionAndDashboard. */
export async function createQuestionAndDashboard(
  api: MetabaseApi,
  {
    questionDetails,
    dashboardDetails,
    cardDetails,
  }: {
    questionDetails: StructuredQuestionDetails;
    dashboardDetails?: DashboardDetails;
    cardDetails?: Record<string, unknown>;
  },
): Promise<QuestionAndDashboardResult> {
  const { id: card_id } = await createQuestion(api, questionDetails);
  const { id: dashboard_id } = await createDashboard(api, dashboardDetails);
  const response = await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      { id: -1, card_id, row: 0, col: 0, size_x: 11, size_y: 6, ...cardDetails },
    ],
  });
  const body = (await response.json()) as { dashcards: DashCard[] };
  return questionAndDashboardResult(body.dashcards[0], card_id, dashboard_id);
}

/**
 * Port of H.createNativeQuestionAndDashboard. Threads `tabs` +
 * `dashboard_tab_id` from dashboardDetails (embedding-dashboard's tabbed case);
 * with no tabs this sends `tabs: []` + `dashboard_tab_id: null`, matching the
 * dashboard-management copy.
 */
export async function createNativeQuestionAndDashboard(
  api: MetabaseApi,
  {
    questionDetails,
    dashboardDetails,
  }: {
    questionDetails: NativeQuestionDetails;
    dashboardDetails?: DashboardDetails;
  },
): Promise<QuestionAndDashboardResult> {
  const dashboardTabs =
    (dashboardDetails?.tabs as { id: number; name: string }[]) ?? [];
  const firstTabId = dashboardTabs[0]?.id ?? null;

  const { id: card_id } = await createNativeQuestion(api, questionDetails);
  const { id: dashboard_id } = await createDashboard(api, dashboardDetails);
  const response = await api.put(`/api/dashboard/${dashboard_id}`, {
    tabs: dashboardTabs,
    dashcards: [
      {
        id: -1,
        card_id,
        dashboard_tab_id: firstTabId,
        row: 0,
        col: 0,
        size_x: 11,
        size_y: 6,
      },
    ],
  });
  const body = (await response.json()) as { dashcards: DashCard[] };
  return questionAndDashboardResult(body.dashcards[0], card_id, dashboard_id);
}

/**
 * Port of H.createDashboardWithQuestions (api/createDashboardWithQuestions.ts):
 * create the dashboard, then create each question (native or structured) and
 * append it — re-reading the dashboard each time so earlier cards survive the
 * PUT — honoring an optional per-card layout array. Accepts either
 * `dashboardName` or `dashboardDetails` (the two shapes the copies used).
 */
export async function createDashboardWithQuestions(
  api: MetabaseApi,
  {
    dashboardName,
    dashboardDetails,
    questions,
    cards,
  }: {
    dashboardName?: string;
    dashboardDetails?: DashboardDetails;
    questions: (StructuredQuestionDetails | NativeQuestionDetails)[];
    cards?: Record<string, unknown>[];
  },
): Promise<{ dashboard: Dashboard; questions: Card[] }> {
  const dashboard = await createDashboard(api, {
    name: dashboardName,
    ...dashboardDetails,
  });

  const created: Card[] = [];
  for (let index = 0; index < questions.length; index++) {
    const questionDetails = questions[index];
    const question =
      "native" in questionDetails && questionDetails.native != null
        ? await createNativeQuestion(api, questionDetails as NativeQuestionDetails)
        : await createQuestion(api, questionDetails as StructuredQuestionDetails);
    const current = (await (
      await api.get(`/api/dashboard/${dashboard.id}`)
    ).json()) as { dashcards: DashCard[] };
    await api.put(`/api/dashboard/${dashboard.id}`, {
      dashcards: [
        ...current.dashcards,
        {
          id: -1,
          card_id: question.id,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 8,
          ...(cards ? cards[index] : {}),
        },
      ],
    });
    created.push(question);
  }
  return { dashboard, questions: created };
}

/**
 * Port of H.createDashboardWithTabs (api/createDashboardWithTabs.ts): create the
 * dashboard (via createDashboard, so enable_embedding / embedding_* /
 * auto_apply_filters are held back and applied — embedding-dashboard's copy
 * needs this), then PUT it back with the dashcards and tabs attached. Returns
 * the full PUT body so callers can read tab/dashcard/entity ids.
 */
export async function createDashboardWithTabs(
  api: MetabaseApi,
  {
    tabs = [],
    dashcards = [],
    name = "Test Dashboard",
    ...details
  }: {
    tabs?: { id: string | number; name: string }[];
    dashcards?: Record<string, unknown>[];
    name?: string;
  } & DashboardDetails,
): Promise<Dashboard> {
  const dashboard = await createDashboard(api, { name, ...details });
  const updated = await api.put(`/api/dashboard/${dashboard.id}`, {
    ...dashboard,
    dashcards,
    tabs,
  });
  return (await updated.json()) as Dashboard;
}
