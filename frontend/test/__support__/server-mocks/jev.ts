import fetchMock from "fetch-mock";

import type { JevClassifyPreview } from "metabase/api";
import type { DashboardFocus } from "metabase/api/jev";
import type {
  JevCardCollectionKind,
  JevCreateIntent,
  JevDashboardPlan,
  JevQuestionPlan,
} from "metabase/api/jev-create";
import type {
  JevFilterSuggestions,
  JevQuestionSlots,
} from "metabase/api/jev-filters";

/** Mocks the Jev usage-shape chips the notebook data step fetches for its table. */
export function setupJevTableShapesEndpoint() {
  fetchMock.get("express:/api/jev/usage/table/:id/shapes", (call) => ({
    table_id: Number(call.url.split("/").at(-2)),
    chips: [],
  }));
}

/** Mocks Jev join-edge suggestions (the join table picker and next-step hints fire it). */
export function setupJevJoinSuggestionsEndpoint() {
  fetchMock.post("path:/api/jev/joins/suggestions", {
    suggestions: [],
    candidate_count: 0,
    tables_considered: 0,
    status: "no-candidates",
    elapsed_ms: 0,
  });
}

const NO_FILTER_SUGGESTIONS: JevFilterSuggestions = {
  status: "no-candidates",
  filters: [],
  candidate_count: 0,
  elapsed_ms: 0,
};

/** Mocks Jev's plain-English dashboard filter suggestions (the Cmd/Ctrl+F palette). */
export function setupJevDashboardFiltersEndpoint(
  response: JevFilterSuggestions = NO_FILTER_SUGGESTIONS,
) {
  fetchMock.post("express:/api/jev/filters/dashboard/:id", response);
}

/** Mocks the likely filter "slots" the question filter palette loads on open. */
export function setupJevQuestionFilterSlotsEndpoint(
  response: JevQuestionSlots = { status: "ok", elapsed_ms: 0, slots: [] },
) {
  fetchMock.post("path:/api/jev/filters/question/slots", response);
}

/** Mocks Jev's plain-English question filter suggestions. */
export function setupJevQuestionFiltersEndpoint(
  response: JevFilterSuggestions = NO_FILTER_SUGGESTIONS,
) {
  fetchMock.post("path:/api/jev/filters/question", response);
}

/** Mocks Jev chart-type ranking (the chart-type picker fires it on result load). Empty ranking = no Jev hints. */
export function setupJevVizSuggestEndpoint() {
  fetchMock.post("path:/api/jev/viz/suggest", {
    structure: "",
    roles: [],
    ranked: [],
  });
}

export function setupJevClassifyPreviewEndpoint(
  response: JevClassifyPreview = {
    columns: [],
    rows: [],
    stats: { rows: 0, "jev-failures": 0, "elapsed-ms": 0 },
  },
) {
  fetchMock.post("path:/api/jev/classify/preview", response);
}

const NO_DASHBOARD_FOCUS: DashboardFocus = {
  dashboard_id: 1,
  intent: "",
  available: false,
  cards: [],
  filters: [],
};

/** Mocks Jev dashboard focus (the dashboard filter palette asks it alongside filter suggestions). */
export function setupJevDashboardFocusEndpoint(
  response: DashboardFocus = NO_DASHBOARD_FOCUS,
) {
  fetchMock.post("express:/api/jev/dashboard/:id/focus", response);
}

const UNAVAILABLE_CREATE_INTENT: JevCreateIntent = {
  status: "unavailable",
  elapsed_ms: 0,
  kind: null,
  tables: [],
};

/** Mocks step 1 of "New with Jev" (Cmd/Ctrl+J): question or dashboard, and ranked tables. */
export function setupJevCreateIntentEndpoint(
  response: JevCreateIntent = UNAVAILABLE_CREATE_INTENT,
) {
  fetchMock.post("path:/api/jev/create/intent", response);
}

/** Mocks "New with Jev"'s question plan for one table. */
export function setupJevCreateQuestionEndpoint(response: JevQuestionPlan) {
  fetchMock.post("path:/api/jev/create/question", response);
}

function isCardCollectionKind(value: unknown): value is JevCardCollectionKind {
  return value === "dashboard" || value === "document";
}

/**
 * Mocks "New with Jev"'s dashboard/document plan: existing questions for the
 * chosen tables. The request's `kind` (default "dashboard") picks the response.
 */
export function setupJevCreateDashboardEndpoint(
  responses: Partial<Record<JevCardCollectionKind, JevDashboardPlan>>,
) {
  fetchMock.post("path:/api/jev/create/dashboard", async (call) => {
    const body: unknown = await call.request?.clone().json();
    const kind =
      body instanceof Object &&
      "kind" in body &&
      isCardCollectionKind(body.kind)
        ? body.kind
        : "dashboard";
    return responses[kind] ?? { status: 404 };
  });
}
