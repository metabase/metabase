/**
 * Helpers for the visualizer-columns-mapping spec port
 * (e2e/test/scenarios/dashboard/visualizer/columns-mapping.cy.spec.ts).
 *
 * NEW helpers only (parallel-agent rule: no edits to shared modules). This
 * module imports the shared visualizer surface from support/visualizer-basics.ts
 * and only adds what that module doesn't already export:
 *  - the ACCOUNTS_COUNT_BY_COUNTRY fixture and COUNTRY_CODES list from
 *    e2e/support/test-visualizer-data.ts.
 *  - clickUndoButton (H.clickUndoButton in e2e-dashboard-visualizer-helpers.ts).
 *
 * TODO(consolidation): fold this into a single shared visualizer module with
 * visualizer-basics.ts / visualizer-cartesian.ts.
 */
import type { Page } from "@playwright/test";

import { SAMPLE_DATABASE } from "./sample-data";
import type { StructuredQuestionDetails } from "./visualizer-basics";

const { ACCOUNTS, ACCOUNTS_ID } = SAMPLE_DATABASE as {
  ACCOUNTS: Record<string, number>;
  ACCOUNTS_ID: number;
};

// === question fixtures + data (test-visualizer-data.ts) ===

export const COUNTRY_CODES = [
  "(empty)",
  "AE",
  "AF",
  "AG",
  "AL",
  "AM",
  "AR",
  "AT",
  "AU",
  "BA",
  "BD",
  "BE",
  "BF",
  "BG",
  "BN",
  "BO",
  "BR",
  "BT",
  "BW",
  "BY",
  "CA",
  "CD",
  "CH",
  "CI",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CY",
  "CZ",
  "DE",
  "DK",
  "DO",
  "DZ",
  "EE",
  "EG",
  "ES",
  "ET",
  "FI",
  "FR",
  "GB",
  "GE",
  "GM",
  "GN",
  "GR",
  "GT",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IN",
  "IQ",
  "IR",
  "IT",
  "JM",
  "JO",
  "JP",
  "KE",
  "KH",
  "KI",
  "KM",
  "KR",
  "KZ",
  "LA",
  "LC",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MD",
  "MG",
  "MK",
  "ML",
  "MM",
  "MT",
  "MU",
  "MW",
  "MX",
  "MY",
  "NE",
  "NG",
  "NI",
  "NL",
  "NO",
  "NZ",
  "PA",
  "PE",
  "PH",
  "PK",
  "PL",
  "PT",
  "PW",
  "PY",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SE",
  "SI",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SV",
  "SY",
  "SZ",
  "TH",
  "TJ",
  "TN",
  "TO",
  "TR",
  "TZ",
  "UA",
  "UG",
  "US",
  "UZ",
  "VE",
  "VN",
  "YE",
  "ZA",
  "ZM",
  "ZW",
];

export const ACCOUNTS_COUNT_BY_COUNTRY: StructuredQuestionDetails = {
  display: "bar",
  name: "Accounts by Country",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
    breakout: [["field", ACCOUNTS.COUNTRY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["COUNTRY"],
    "graph.metrics": ["count"],
  },
};

// === visualizer UI helpers (e2e-dashboard-visualizer-helpers.ts) ===

/** Port of H.clickUndoButton (cy.findByLabelText("Undo") is exact — rule 1;
 * a substring getByLabel also matches the undo-list wrapper and the icon). */
export async function clickUndoButton(page: Page) {
  await page.getByLabel("Undo", { exact: true }).click();
}
