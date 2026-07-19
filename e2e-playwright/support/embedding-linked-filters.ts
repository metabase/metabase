/**
 * Helpers for the embedding-linked-filters spec port (static embedding of a
 * dashboard whose child filter is constrained by a parent filter). NEW helpers
 * live here (parallel-agent rule: no edits to shared modules — everything else
 * is imported read-only).
 *
 * Ports of:
 * - the fixtures in e2e/test/scenarios/embedding/shared/embedding-linked-filters.js
 *   (nativeQuestionDetails / nativeDashboardDetails / mapNativeDashboardParameters
 *   and guiQuestion / guiDashboard / mapGUIDashboardParameters). The two
 *   `cy.request("PUT", …)` mappers become `api.put`.
 * - the spec-local helpers (openFilterOptions / assertOnXYAxisLabels /
 *   searchFieldValuesFilter / removeValueForFilter).
 * - H.applyFilterToast (cy.findByTestId("filter-apply-toast")) — not yet in a
 *   shared module.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { echartsContainer } from "./charts";
import { fieldValuesTextbox } from "./dashboard-filters-reset-clear";
import { filterWidget } from "./dashboard-parameters";
import { SAMPLE_DATABASE } from "./sample-data";
import { icon } from "./ui";

const { PEOPLE, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE as {
  PEOPLE: Record<string, number>;
  PRODUCTS: Record<string, number>;
  PRODUCTS_ID: number;
};

// === shared/embedding-linked-filters.js fixtures ===

export const nativeQuestionDetails = {
  name: "Count of People by State (SQL)",
  native: {
    query:
      'SELECT "PUBLIC"."PEOPLE"."STATE" AS "STATE", count(*) AS "count" FROM "PUBLIC"."PEOPLE" WHERE 1=1 [[ AND {{city}}]] [[ AND {{state}}]] GROUP BY "PUBLIC"."PEOPLE"."STATE" ORDER BY "count" DESC, "PUBLIC"."PEOPLE"."STATE" ASC',
    "template-tags": {
      city: {
        id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
        name: "city",
        "display-name": "City",
        type: "dimension",
        dimension: ["field", PEOPLE.CITY, null],
        "widget-type": "string/=",
      },
      state: {
        id: "6b8b10ef-0104-1047-1e1b-24s2d5954545",
        name: "state",
        "display-name": "State",
        type: "dimension",
        dimension: ["field", PEOPLE.STATE, null],
        "widget-type": "string/=",
      },
    },
  },
  display: "bar",
};

const stateFilter = {
  name: "State",
  slug: "state",
  id: "e8f79be9",
  type: "location/state",
};

const cityFilter = {
  name: "City",
  slug: "city",
  id: "170b8e99",
  type: "location/city",
  filteringParameters: [stateFilter.id],
};

export const nativeDashboardDetails = {
  name: "Embedding Dashboard With Linked Filters",
  parameters: [stateFilter, cityFilter],
};

/** Port of mapNativeDashboardParameters (shared/embedding-linked-filters.js). */
export function mapNativeDashboardParameters(
  api: MetabaseApi,
  {
    id,
    card_id,
    dashboard_id,
  }: { id: number; card_id: number; dashboard_id: number },
) {
  return api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id,
        card_id,
        row: 0,
        col: 0,
        size_x: 24,
        size_y: 10,
        parameter_mappings: [
          {
            parameter_id: stateFilter.id,
            card_id,
            target: ["dimension", ["template-tag", stateFilter.slug]],
          },
          {
            parameter_id: cityFilter.id,
            card_id,
            target: ["dimension", ["template-tag", cityFilter.slug]],
          },
        ],
      },
    ],
  });
}

export const guiQuestion = {
  query: { "source-table": PRODUCTS_ID },
};

const idFilter = {
  name: "ID Filter",
  slug: "id_filter",
  id: "fde6db8b",
  type: "id",
  sectionId: "id",
  default: [1],
};

const categoryFilter = {
  name: "Category",
  slug: "category",
  id: "e8ff3175",
  type: "string/=",
  sectionId: "string",
  filteringParameters: ["fde6db8b"],
};

export const guiDashboard = {
  name: "Dashboard With GUI question",
  parameters: [idFilter, categoryFilter],
};

/** Port of mapGUIDashboardParameters (shared/embedding-linked-filters.js). */
export function mapGUIDashboardParameters(
  api: MetabaseApi,
  id: number,
  card_id: number,
  dashboard_id: number,
) {
  const parameter_mappings = [
    {
      parameter_id: idFilter.id,
      card_id,
      target: ["dimension", ["field", PRODUCTS.ID, null]],
    },
    {
      parameter_id: categoryFilter.id,
      card_id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  ];

  return api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id,
        card_id,
        row: 0,
        col: 0,
        size_x: 13,
        size_y: 8,
        series: [],
        visualization_settings: {},
        parameter_mappings,
      },
    ],
  });
}

// === spec-local helpers ===

/** Port of H.applyFilterToast: cy.findByTestId("filter-apply-toast"). */
export function applyFilterToast(page: Page): Locator {
  return page.getByTestId("filter-apply-toast");
}

/** Port of the spec-local openFilterOptions: click the filter widget by name. */
export async function openFilterOptions(page: Page, name: string) {
  await filterWidget(page, { name }).first().click();
}

/**
 * Port of the spec-local assertOnXYAxisLabels: the chart's axis <text> elements
 * contain the x/y labels. Cypress's `.contains()` is a case-sensitive substring
 * match against the SVG text.
 */
export async function assertOnXYAxisLabels(
  page: Page,
  { xLabel, yLabel }: { xLabel: string; yLabel: string },
) {
  await expect(echartsTextContaining(page, xLabel).first()).toBeVisible();
  await expect(echartsTextContaining(page, yLabel).first()).toBeVisible();
}

/**
 * The chart's <text> elements whose content contains `text` (case-sensitive
 * substring — mirrors chai-jquery `contain` / cy.contains). ECharts SVG axis
 * text can carry leading/trailing whitespace, so no `^`/`\b` anchoring.
 */
export function echartsTextContaining(page: Page, text: string): Locator {
  return echartsContainer(page)
    .locator("text")
    .filter({ hasText: new RegExp(escapeRegExp(text)) });
}

/**
 * Port of `H.echartsContainer().get("text").should("contain", value)`: at least
 * one axis <text> contains `value`.
 */
export async function expectEchartsTextContains(page: Page, value: string) {
  await expect(echartsTextContaining(page, value).first()).toBeVisible();
}

/**
 * Port of `H.echartsContainer().get("text").and("not.contain", value)`: no axis
 * <text> contains `value`.
 */
export async function expectEchartsTextNotContains(page: Page, value: string) {
  await expect(echartsTextContaining(page, value)).toHaveCount(0);
}

/**
 * Port of the spec-local searchFieldValuesFilter: type "An" into the City field
 * filter's value dropdown, confirm the linked-filter constraint (Kiana is
 * offered; Anacoco — a city in a non-AK state — is not), then pick Anchorage.
 */
export async function searchFieldValuesFilter(page: Page) {
  const dropdown = page.getByTestId("parameter-value-dropdown");
  // Typeahead: real keystrokes, not fill() (rule 5).
  await fieldValuesTextbox(dropdown).click();
  await fieldValuesTextbox(dropdown).pressSequentially("An");

  const widget = page.getByTestId("field-values-widget");
  await expect(widget.getByText("Kiana", { exact: true })).toBeVisible();
  await expect(widget.getByText("Anacoco", { exact: true })).toHaveCount(0);
  await widget.getByText("Anchorage", { exact: true }).click();
}

/** Port of the spec-local removeValueForFilter: click the filter widget's close icon. */
export async function removeValueForFilter(page: Page, label: string) {
  const widget = filterWidget(page, { name: label });
  await widget.hover();
  await icon(widget, "close").click();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
