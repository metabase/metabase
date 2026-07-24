/**
 * Playwright port of
 * e2e/test/scenarios/native-filters/sql-filters-reset-clear.cy.spec.ts
 *
 * Porting notes:
 * - The Cypress `createNativeQuestionWithParameters` builds a native card with
 *   four template tags and visits it (visitQuestion: true). Reuses
 *   createNativeQuestionWithParameters (native-filters-extras — parameters
 *   optional here) + visitQuestionEitherEndpoint: the card is created via the
 *   API with hand-written template-tags, so on load the QB may run it through
 *   /api/card/:id/query or /api/dataset (see native-extras header). The spec
 *   only exercises the filter widgets, never the query results.
 * - All the check* flows / widget locators live in
 *   support/sql-filters-reset-clear.ts (new file). The type-specific set/update
 *   callbacks are passed in here, matching the Cypress structure.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { test } from "../support/fixtures";
import { createNativeQuestionWithParameters } from "../support/native-filters-extras";
import { visitQuestionEitherEndpoint } from "../support/native-extras";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  DEFAULT_NON_REQUIRED,
  DEFAULT_REQUIRED,
  NO_DEFAULT_NON_REQUIRED,
  NO_DEFAULT_REQUIRED,
  type SectionId,
  addDateFilter,
  checkNativeParametersDropdown,
  checkNativeParametersInput,
  checkParameterSidebarDefaultValueDate,
  checkParameterSidebarDefaultValueDropdown,
  setDropdownFieldValue,
  setInputValue,
  updateDateFilter,
  updateDropdownFieldValue,
} from "../support/sql-filters-reset-clear";

const { PRODUCTS } = SAMPLE_DATABASE;

async function createNativeQuestionWithTemplateTags(
  page: Page,
  api: MetabaseApi,
  templateTags: Record<SectionId, Record<string, unknown>>,
) {
  const { id } = await createNativeQuestionWithParameters(api, {
    native: {
      query:
        "select {{no_default_non_required}}, {{no_default_required}}, {{default_non_required}}, {{default_required}}",
      "template-tags": templateTags,
    },
  });
  await visitQuestionEitherEndpoint(page, id);
}

test.describe("scenarios > filters > sql filters > reset & clear", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("text parameters", async ({ page, mb }) => {
    await createNativeQuestionWithTemplateTags(page, mb.api, {
      no_default_non_required: {
        name: "no_default_non_required",
        "display-name": NO_DEFAULT_NON_REQUIRED,
        id: "fed1b918",
        type: "text",
      },
      no_default_required: {
        name: "no_default_required",
        "display-name": NO_DEFAULT_REQUIRED,
        id: "fed1b919",
        type: "text",
        required: true,
      },
      default_non_required: {
        name: "default_non_required",
        "display-name": DEFAULT_NON_REQUIRED,
        id: "75d67d38",
        type: "text",
        default: "a",
      },
      default_required: {
        name: "default_required",
        "display-name": DEFAULT_REQUIRED,
        id: "60f12ac8",
        type: "text",
        required: true,
        default: "a",
      },
    });

    await checkNativeParametersInput(page, {
      defaultValueFormatted: "a",
      otherValue: "{backspace}b",
      otherValueFormatted: "b",
      setValue: setInputValue,
    });
  });

  test("number parameters", async ({ page, mb }) => {
    await createNativeQuestionWithTemplateTags(page, mb.api, {
      no_default_non_required: {
        name: "no_default_non_required",
        "display-name": NO_DEFAULT_NON_REQUIRED,
        id: "fed1b918",
        type: "number",
      },
      no_default_required: {
        name: "no_default_required",
        "display-name": NO_DEFAULT_REQUIRED,
        id: "fed1b919",
        type: "number",
        required: true,
      },
      default_non_required: {
        name: "default_non_required",
        "display-name": DEFAULT_NON_REQUIRED,
        id: "75d67d38",
        type: "number",
        default: "1",
      },
      default_required: {
        name: "default_required",
        "display-name": DEFAULT_REQUIRED,
        id: "60f12ac8",
        type: "number",
        required: true,
        default: "1",
      },
    });

    await checkNativeParametersInput(page, {
      defaultValueFormatted: "1",
      otherValue: "{backspace}2",
      otherValueFormatted: "2",
      setValue: setInputValue,
    });
  });

  test("date parameters", async ({ page, mb }) => {
    await createNativeQuestionWithTemplateTags(page, mb.api, {
      no_default_non_required: {
        name: "no_default_non_required",
        "display-name": NO_DEFAULT_NON_REQUIRED,
        id: "fed1b918",
        type: "date",
      },
      no_default_required: {
        name: "no_default_required",
        "display-name": NO_DEFAULT_REQUIRED,
        id: "fed1b919",
        type: "date",
        required: true,
      },
      default_non_required: {
        name: "default_non_required",
        "display-name": DEFAULT_NON_REQUIRED,
        id: "75d67d38",
        type: "date",
        default: "2027-01-01",
      },
      default_required: {
        name: "default_required",
        "display-name": DEFAULT_REQUIRED,
        id: "60f12ac8",
        type: "date",
        required: true,
        default: "2027-01-01",
      },
    });

    await checkNativeParametersDropdown(page, {
      defaultValueFormatted: "January 1, 2027",
      otherValue: "01/01/2020",
      otherValueFormatted: "January 1, 2020",
      setValue: (page, value) => addDateFilter(page, value),
      updateValue: (page, value) => updateDateFilter(page, value),
    });

    await checkParameterSidebarDefaultValueDate(page, {
      defaultValueFormatted: "January 1, 2027",
      otherValue: "01/01/2020",
      otherValueFormatted: "January 1, 2020",
    });
  });

  test("field parameters", async ({ page, mb }) => {
    await createNativeQuestionWithTemplateTags(page, mb.api, {
      no_default_non_required: {
        name: "no_default_non_required",
        "display-name": NO_DEFAULT_NON_REQUIRED,
        id: "fed1b918",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
      },
      no_default_required: {
        name: "no_default_required",
        "display-name": NO_DEFAULT_REQUIRED,
        id: "fed1b919",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
        required: true,
      },
      default_non_required: {
        name: "default_non_required",
        "display-name": DEFAULT_NON_REQUIRED,
        id: "75d67d38",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
        default: ["Gizmo"],
      },
      default_required: {
        name: "default_required",
        "display-name": DEFAULT_REQUIRED,
        id: "60f12ac8",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
        required: true,
        default: ["Gizmo"],
      },
    });

    await checkNativeParametersDropdown(page, {
      defaultValueFormatted: "Gizmo",
      otherValue: "{backspace}Gadget",
      otherValueFormatted: "Gadget",
      setValue: setDropdownFieldValue,
      updateValue: updateDropdownFieldValue,
    });

    await checkParameterSidebarDefaultValueDropdown(page, {
      defaultValueFormatted: "Gizmo",
      otherValue: "{backspace}Gadget",
      otherValueFormatted: "Gadget",
      setValue: setDropdownFieldValue,
      updateValue: updateDropdownFieldValue,
    });
  });
});
