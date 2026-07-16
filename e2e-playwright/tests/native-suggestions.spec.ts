/**
 * Playwright port of e2e/test/scenarios/native/suggestions.cy.spec.ts
 *
 * Porting notes:
 * - The Cypress spec's `.should("have.length", 1)` on a cy.contains result is
 *   trivially true (cy.contains yields one element); here toHaveCount(1)
 *   asserts the intended "no duplicate suggestions" meaning for real.
 * - Visibility/text assertions use .first() to mirror cy.contains's
 *   first-match semantics under Playwright strict mode.
 */
import { test, expect } from "../support/fixtures";
import {
  nativeEditorCompletion,
  nativeEditorCompletions,
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";

test.describe("scenarios > question > native > suggestions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show suggestions for tables", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "se");

    await expect(nativeEditorCompletions(page)).toBeVisible();
    const completion = nativeEditorCompletion(page, "SEATS").first();
    await expect(completion).toBeVisible();
    await expect(completion).toContainText("ACCOUNTS :type/Integer");
  });

  test("should show suggestions for syntax keywords", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "se");

    await expect(nativeEditorCompletions(page)).toBeVisible();
    const completion = nativeEditorCompletion(page, "SELECT").first();
    await expect(completion).toBeVisible();
    await expect(completion).toContainText("keyword");
  });

  test("should suggest locals", async ({ page }) => {
    await startNewNativeQuestion(page, {
      query:
        "SELECT date_trunc('month', CREATED_AT) as order_month FROM ORDERS GROUP BY ",
    });
    await typeInNativeEditor(page, "order_mo");

    await expect(nativeEditorCompletions(page)).toBeVisible();
    const completion = nativeEditorCompletion(page, "order_month").first();
    await expect(completion).toBeVisible();
    await expect(completion).toContainText("local");
  });

  test("should suggest quoted locals", async ({ page }) => {
    await startNewNativeQuestion(page, {
      query: 'SELECT foo as "QUOTED_local" FROM ORDERS GROUP BY ',
    });
    await typeInNativeEditor(page, "QU");

    await expect(nativeEditorCompletions(page)).toBeVisible();
    const completion = nativeEditorCompletion(page, "QUOTED_local").first();
    await expect(completion).toBeVisible();
    await expect(completion).toContainText("local");
  });

  test("should not show duplicate suggestions", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "acc");

    await expect(nativeEditorCompletions(page)).toBeVisible();
    const completion = nativeEditorCompletion(page, "ACCOUNT_ID");
    await expect(completion).toHaveCount(1);
    await expect(completion).toBeVisible();
  });
});

test.describe("scenarios > question > native > suggestions", { tag: "@mongo" }, () => {
  // The mongo-5 snapshot only exists when the QA-DB containers were up during
  // snapshot generation (Cypress gates these via the @mongo tag; the
  // Playwright CI workflow generates snapshots with -@external, so no QA DBs).
  test.skip(
    !process.env.QA_DB_ENABLED,
    "Requires the mongo QA database and its mongo-5 snapshot (set QA_DB_ENABLED)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore("mongo-5");
    await mb.signInAsAdmin();
  });

  test("should suggest keywords", async ({ page }) => {
    await startNewNativeQuestion(page, { database: 2, query: "" });
    await typeInNativeEditor(page, '[{ "$grou');

    await expect(nativeEditorCompletions(page)).toBeVisible();
    const completion = nativeEditorCompletion(page, "$group");
    await expect(completion).toHaveCount(1);
    await expect(completion).toBeVisible();
    await expect(completion).toContainText("keyword");
  });

  test("should suggest tables and fields from the schema", async ({
    page,
  }) => {
    await startNewNativeQuestion(page, { database: 2, query: "" });
    await typeInNativeEditor(page, '[{ "$group": { "pr');

    await expect(nativeEditorCompletions(page)).toBeVisible();

    const price = nativeEditorCompletion(page, "price").first();
    await expect(price).toBeVisible();
    await expect(price).toContainText("products :type/Float");

    const productId = nativeEditorCompletion(page, "product_id").first();
    await expect(productId).toBeVisible();
    await expect(productId).toContainText("orders :type/Integer");

    const products = nativeEditorCompletion(page, "products").first();
    await expect(products).toBeVisible();
    await expect(products).toContainText("Table");
  });
});
