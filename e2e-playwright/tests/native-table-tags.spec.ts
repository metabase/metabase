/**
 * Playwright port of e2e/test/scenarios/native/table-tags.cy.spec.ts
 *
 * Covers table template tags ({{table}}): typing the tag into the native
 * editor, assigning it the "Table" variable type, mapping it to a concrete
 * table (referenced as a CTE at run time), running the query, and asserting the
 * row count.
 *
 * Porting notes:
 * - H.NativeEditor.type -> typeInNativeEditor (click-to-focus + real keys).
 * - findByText string args are exact (PORTING rule 1) — handled inside
 *   mapTableTag.
 */
import { test } from "../support/fixtures";
import { mapTableTag } from "../support/native-table-tags";
import {
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import { assertQueryBuilderRowCount } from "../support/notebook";
import { runNativeQuery } from "../support/models";

test.describe("scenarios > native > table tags", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should run the query with a mapped table", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select * from {{table}}");
    await mapTableTag(page, "Products");
    await runNativeQuery(page);
    await assertQueryBuilderRowCount(page, 200);
  });
});
