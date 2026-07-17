/**
 * Playwright port of e2e/test/scenarios/native/snippet-tags.cy.spec.ts
 *
 * Porting notes:
 * - The snippet form's name/content fields are plain Mantine TextInput /
 *   FormTextarea elements (not CodeMirror), so fill() replaces the Cypress
 *   type(..., { parseSpecialCharSequences: false }) calls — braces are typed
 *   literally either way.
 * - The Cypress createQuestionAndSnippet fixture sets enable_embedding /
 *   embedding_params on the card even though no test exercises embedding;
 *   kept for parity (createNativeCard replays the factory's follow-up PUT).
 * - cy.icon("chevrondown").click({ force: true }) in the snippet sidebar is
 *   force-clicked in Cypress because the icon is hidden until hover; here we
 *   hover the snippet row first and click for real.
 * - The two "change the inner tag type" tests are test.fixme: they fail
 *   because of an app bug (snippet-inner variable tags not surfaced when a
 *   saved question loads), reproduced byte-for-byte by the original Cypress
 *   spec against the same backend. See the FIXME on the Number test.
 */
import type { Page } from "@playwright/test";

import { filterWidget } from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { modal, runNativeQuery, tableInteractive } from "../support/models";
import {
  nativeEditor,
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import {
  assertTableRowsCount,
  clearNativeEditor,
  createNativeCard,
  createSnippet,
} from "../support/native-extras";
import { assertQueryBuilderRowCount } from "../support/notebook";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import { popover, visitQuestion } from "../support/ui";

import type { MetabaseApi } from "../support/api";

test.describe("scenarios > native > snippet tags", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to create a snippet with variable tags", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select id from products where ");

    // create a snippet
    await icon(getEditorTopBar(page), "snippet").click();
    await getEditorSidebar(page)
      .getByText("Create snippet", { exact: true })
      .click();
    await getSnippetContentInput(page).fill("category = {{category}}");
    await getSnippetNameInput(page).fill("variable-snippet");
    await modal(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    // verify that the snippet was inserted
    await expect(nativeEditor(page)).toContainText(
      "select id from products where {{snippet: variable-snippet}}",
    );

    // verify that the query can be run
    await getEditorTopBar(page)
      .getByPlaceholder("Category", { exact: true })
      .fill("Widget");
    await runNativeQuery(page);
    await assertQueryBuilderRowCount(page, 54);
  });

  test("should be able to create a snippet with card tags", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select * from ");

    // create a snippet
    await icon(getEditorTopBar(page), "snippet").click();
    await getEditorSidebar(page)
      .getByText("Create snippet", { exact: true })
      .click();
    await getSnippetContentInput(page).fill(`{{#${ORDERS_QUESTION_ID}}}`);
    await getSnippetNameInput(page).fill("card-snippet");
    await modal(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    // verify that the snippet was inserted
    await expect(nativeEditor(page)).toContainText(
      "select * from {{snippet: card-snippet}}",
    );

    // verify that the query can be run
    await runNativeQuery(page);
    await expect(tableInteractive(page)).toBeVisible();
  });

  test("should be able to create a snippet with snippet tags", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select * from ");

    // create a snippet
    await icon(getEditorTopBar(page), "snippet").click();
    await getEditorSidebar(page)
      .getByText("Create snippet", { exact: true })
      .click();
    await getSnippetContentInput(page).fill("category = {{category}}");
    await getSnippetNameInput(page).fill("snippet1");
    await modal(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    // create a snippet that uses the previous snippet
    await icon(getEditorTopBar(page), "snippet").click();
    await icon(getEditorSidebar(page), "add").click();
    await popover(page).getByText("New snippet", { exact: true }).click();
    await getSnippetContentInput(page).fill("{{snippet: snippet1}}");
    await getSnippetNameInput(page).fill("snippet2");
    await modal(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    // verify that the snippet can be used
    await clearNativeEditor(page);
    await typeInNativeEditor(
      page,
      "select id from products where {{snippet: snippet2}}",
    );
    // The widget wrapper div carries the same aria-label as the textbox
    // inside it, so getByLabel resolves to the (unfillable) div — target the
    // textbox by role instead (Cypress findByLabelText found the input).
    await getEditorTopBar(page)
      .getByRole("textbox", { name: "Category", exact: true })
      .fill("Gizmo");
    await runNativeQuery(page);
    await expect(tableInteractive(page)).toBeVisible();
  });

  test("should be able to update a snippet and change tags", async ({
    mb,
    page,
  }) => {
    const { card } = await createQuestionAndSnippet(mb.api);
    await visitQuestion(page, card.id);

    // update the snippet
    await getEditorVisibilityToggler(page).click();
    await icon(getEditorTopBar(page), "snippet").click();
    const sidebar = getEditorSidebar(page);
    await sidebar.getByText("filter-snippet", { exact: true }).hover();
    await icon(sidebar, "chevrondown").click();
    await sidebar.getByRole("button", { name: /Edit/ }).click();
    await getSnippetContentInput(page).fill(
      "ean = {{ean}} or vendor = {{vendor}}",
    );
    await modal(page)
      .getByRole("button", { name: "Save", exact: true })
      .click();

    // verify that the tags in the query were updated
    const topBar = getEditorTopBar(page);
    await expect(
      topBar.getByPlaceholder("Filter", { exact: true }),
    ).toHaveCount(0);
    await topBar.getByPlaceholder("Ean", { exact: true }).fill("1018947080336");
    await topBar
      .getByPlaceholder("Vendor", { exact: true })
      .fill("Balistreri-Ankunding");
    await runNativeQuery(page);
    await assertTableRowsCount(page, 2);
  });

  // FIXME(app bug, not a port bug): variable tags that live only inside a
  // snippet's content are not surfaced when a SAVED question loads — no
  // parameter widget renders and the Variables sidebar never shows
  // variable-type-select (the tag is persisted in the card's template-tags;
  // interactive flows in the tests above still work). Verified 2026-07-17
  // against this backend: the ORIGINAL Cypress spec fails identically on this
  // test and the Field Filter one ("Unable to find [data-testid=
  // variable-type-select]"), so this is app behavior, not the port.
  test.fixme(
    "should be able to change the inner tag type to Number",
    async ({ mb, page }) => {
      const { card } = await createQuestionAndSnippet(mb.api, {
        snippetContent: "ID = {{filter}}",
      });
      await visitQuestion(page, card.id);

      // change the type
      await getEditorVisibilityToggler(page).click();
      await icon(getEditorTopBar(page), "variable").click();
      await getVariableTypeSelect(page).click();
      await popover(page).getByText("Number", { exact: true }).click();

      // verify that the parameter can be used
      await getEditorTopBar(page)
        .getByPlaceholder("Filter", { exact: true })
        .fill("10");
      await runNativeQuery(page);
      await assertQueryBuilderRowCount(page, 1);
    },
  );

  // FIXME(app bug, not a port bug): same snippet-inner-tag loading bug as the
  // Number test above — see that test's FIXME for the evidence.
  test.fixme(
    "should be able to change the inner tag type to Field Filter",
    async ({ mb, page }) => {
      const { card } = await createQuestionAndSnippet(mb.api, {
        snippetContent: "{{filter}}",
      });
      await visitQuestion(page, card.id);

      // change the type
      await getEditorVisibilityToggler(page).click();
      await icon(getEditorTopBar(page), "variable").click();
      await getVariableTypeSelect(page).click();
      await popover(page).getByText("Field Filter", { exact: true }).click();
      await popover(page).getByText("Products", { exact: true }).click();
      await popover(page).getByText("Category", { exact: true }).click();

      // verify that the parameter can be used
      await filterWidget(page).click();
      const dropdown = popover(page);
      await dropdown.getByText("Gadget", { exact: true }).click();
      await dropdown
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await runNativeQuery(page);
      await assertQueryBuilderRowCount(page, 53);
    },
  );
});

function getEditorSidebar(page: Page) {
  return page.getByTestId("sidebar-right");
}

function getEditorTopBar(page: Page) {
  return page.getByTestId("native-query-top-bar");
}

function getEditorVisibilityToggler(page: Page) {
  return page.getByTestId("visibility-toggler");
}

function getVariableTypeSelect(page: Page) {
  return page.getByTestId("variable-type-select");
}

function getSnippetNameInput(page: Page) {
  return modal(page).getByLabel("Give your snippet a name", { exact: true });
}

function getSnippetContentInput(page: Page) {
  return modal(page).getByLabel(
    "Enter some SQL here so you can reuse it later",
    { exact: true },
  );
}

/** Port of the spec-local createQuestionAndSnippet fixture. */
async function createQuestionAndSnippet(
  api: MetabaseApi,
  {
    snippetContent = "category = {{filter}}",
  }: { snippetContent?: string } = {},
) {
  const snippet = await createSnippet(api, {
    name: "filter-snippet",
    content: snippetContent,
  });
  const card = await createNativeCard(api, {
    native: {
      query: "select id from products [[where {{snippet: filter-snippet}}]]",
      "template-tags": {
        "snippet: filter-snippet": {
          id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
          name: "snippet: filter-snippet",
          "display-name": "snippet: filter-snippet",
          type: "snippet",
          "snippet-id": snippet.id,
          "snippet-name": snippet.name,
        },
        filter: {
          id: "4b77cc1f-ea70-4ef6-84db-58432fce6929",
          name: "filter",
          "display-name": "Filter",
          type: "text",
        },
      },
    },
    enable_embedding: true,
    embedding_params: {
      filter: "enabled",
    },
  });
  return { card, snippet };
}
