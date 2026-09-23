/**
 * Playwright port of e2e/test/scenarios/native/native_subquery.cy.spec.js
 *
 * Porting notes:
 * - The Cypress cy.visit + cy.reload pairs ("refresh the state, so previously
 *   created questions need to be loaded again") are kept as page.reload()
 *   for parity, even though every page.goto is already a fresh app state.
 * - The Cypress cy.wait(200)/cy.wait(1000) sleeps around autocomplete are
 *   kept: they wait out AUTOCOMPLETE_DEBOUNCE_DURATION (metabase#20970),
 *   which no response/DOM signal exposes.
 * - The Cypress originals visit with a bare cy.visit and never wait on the
 *   query. Most of the ports upgrade that to visitQuestion, but a card whose
 *   `{{#id}}` tag is stored without the referenced card's slug gets rewritten
 *   on load and therefore runs ad-hoc: the saved-card endpoint visitQuestion
 *   waits for never fires. Those visits use visitQuestionEitherEndpoint.
 * - "autocomplete should work for columns from referenced questions" ended
 *   with `NativeEditor.completions("ANOTHER")` — completions() takes no
 *   argument, so Cypress only checked that *some* completion tooltip was
 *   visible. The port asserts the ANOTHER completion actually appears.
 * - The question rename types into an EditableText title: click swaps in a
 *   textbox named "Add title" (from its placeholder), typed with
 *   pressSequentially and anchored on the PUT /api/card response (the wave-5
 *   EditableText gotcha; Cypress relied on navigation timing instead).
 * - The move in "autocomplete should complete question slugs" also anchors on
 *   the PUT /api/card response, so navigating away can't cancel the move.
 * - "card reference tags should update..." was briefly test.fixme'd as an app
 *   bug (card tag slugs not rewritten on question load). That does not hold
 *   against the CI uberjar — the rewrite works; the visitQuestion hang above
 *   was the real cause. It is enabled again. See
 *   findings-inbox/native-subquery-ci-failure.md.
 */
import { test, expect } from "../support/fixtures";
import { openQuestionActions, visitModel } from "../support/models";
import {
  createNativeCard,
  visitQuestionEitherEndpoint,
} from "../support/native-extras";
import {
  focusNativeEditor,
  nativeEditor,
  nativeEditorCompletion,
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import { entityPickerModal } from "../support/notebook";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import { visitQuestion } from "../support/ui";

test.describe("scenarios > question > native subquery", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("typing a card tag should open the data reference", async ({
    mb,
    page,
  }) => {
    const { id: questionId1 } = await createNativeCard(mb.api, {
      name: "A People Question",
      native: { query: "SELECT id AS a_unique_column_name FROM PEOPLE" },
    });
    const { id: questionId2 } = await createNativeCard(mb.api, {
      name: "A People Model",
      native: { query: "SELECT id AS another_unique_column_name FROM PEOPLE" },
      type: "model",
    });

    const tagName1 = `#${questionId1}-a-people-question`;
    const { id: questionId3 } = await createNativeCard(mb.api, {
      name: "Count of People",
      native: { query: `{{${tagName1}}}` },
    });

    await visitQuestion(page, questionId3);
    // Refresh the state, so previously created questions need to be loaded again.
    await page.reload();
    await page.getByText("Open Editor", { exact: true }).click();

    // placing the cursor inside an existing template tag should open the data reference
    await focusNativeEditor(page);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(
      page.getByText("A People Question", { exact: true }),
    ).toBeVisible();

    // subsequently moving the cursor out from the tag should keep the data reference open
    await focusNativeEditor(page);
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByText("A People Question", { exact: true }),
    ).toBeVisible();

    // typing a template tag id should open the editor
    await typeInNativeEditor(page, " ");
    await typeInNativeEditor(page, `{{#${questionId2}`);
    await expect(
      page.getByText("A People Model", { exact: true }),
    ).toBeVisible();
  });

  test("autocomplete should complete question slugs inside template tags", async ({
    mb,
    page,
  }) => {
    // Create a question and a model.
    const { id: questionId1 } = await createNativeCard(mb.api, {
      name: "A People Question",
      native: { query: "SELECT id FROM PEOPLE" },
    });
    const { id: questionId2 } = await createNativeCard(mb.api, {
      name: "A People Model",
      native: { query: "SELECT id FROM PEOPLE" },
      type: "model",
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    });

    // Move question 2 to Our analytics.
    await visitModel(page, questionId2);
    await openQuestionActions(page);
    await page.getByTestId("move-button").click();
    const picker = entityPickerModal(page);
    await picker.getByText(/Our analytics/).click();
    const moveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === `/api/card/${questionId2}`,
    );
    await picker.getByRole("button", { name: "Move", exact: true }).click();
    await moveResponse;

    await startNewNativeQuestion(page);
    // Refresh the state, so previously created questions need to be loaded again.
    await page.reload();
    await focusNativeEditor(page);

    await page.waitForTimeout(200); // This reduces flakiness

    await typeInNativeEditor(page, " {{#people");

    // Wait until another explicit autocomplete is triggered
    // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
    // See https://github.com/metabase/metabase/pull/20970
    await page.waitForTimeout(1000);

    const modelCompletion = nativeEditorCompletion(
      page,
      `${questionId2}-a-`,
    ).first();
    await expect(modelCompletion).toBeVisible();
    await expect(modelCompletion).toContainText("Model in Our analytics");

    const questionCompletion = nativeEditorCompletion(
      page,
      `${questionId1}-a-`,
    ).first();
    await expect(questionCompletion).toBeVisible();
    await expect(questionCompletion).toContainText("Question in Our analytics");
  });

  test("autocomplete should work for columns from referenced questions", async ({
    mb,
    page,
  }) => {
    // Create two saved questions, the first will be referenced in the query when
    // it is opened, and the second will be added to the query after it is opened.
    const { id: questionId1 } = await createNativeCard(mb.api, {
      name: "A People Question 1",
      native: { query: "SELECT id AS a_unique_column_name FROM PEOPLE" },
    });
    const { id: questionId2 } = await createNativeCard(mb.api, {
      name: "A People Question 2",
      native: { query: "SELECT id AS another_unique_column_name FROM PEOPLE" },
    });

    const tagID = `#${questionId1}`;
    const { id: questionId3 } = await createNativeCard(mb.api, {
      name: "Count of People",
      native: {
        query: `select COUNT(*) from {{#${questionId1}}}`,
        "template-tags": {
          [tagID]: {
            id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
            name: tagID,
            "display-name": tagID,
            type: "card",
            "card-id": questionId1,
          },
        },
      },
    });

    // Not visitQuestion: this card's `{{#id}}` tag is stored without the
    // referenced card's slug, so the QB rewrites it on load and runs the
    // question ad-hoc via /api/dataset — the saved-card endpoint never fires.
    await visitQuestionEitherEndpoint(page, questionId3);
    // Refresh the state, so previously created questions need to be loaded again.
    await page.reload();
    await page.getByText("Open Editor", { exact: true }).click();

    await typeInNativeEditor(page, " ");
    await typeInNativeEditor(page, "a_unique");

    // Wait until another explicit autocomplete is triggered
    // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
    // See https://github.com/metabase/metabase/pull/20970
    await page.waitForTimeout(1000);

    // On slower CI machines the completion fetch can outlive the debounce
    // sleep, and the tooltip won't re-open on its own — nudge by retyping
    // the last character until the named completion appears.
    await expect(async () => {
      const completion = nativeEditorCompletion(
        page,
        "A_UNIQUE_COLUMN_NAME",
      ).first();
      try {
        await expect(completion).toBeVisible({ timeout: 3000 });
      } catch (error) {
        await page.keyboard.press("Backspace");
        await page.keyboard.type("e", { delay: 50 });
        throw error;
      }
    }).toPass({ timeout: 20_000 });

    await typeInNativeEditor(page, ` {{#${questionId2}}}`);

    // Again, typing it in one go doesn't always work, so type it in two parts.
    await typeInNativeEditor(page, " ");
    await typeInNativeEditor(page, "another");

    await expect(nativeEditorCompletion(page, "ANOTHER").first()).toBeVisible();
  });

  // This was briefly FIXME'd as an app bug ("card-reference tags are no longer
  // rewritten on load; GET /api/card/<refId> never fires"). That diagnosis does
  // not hold: against the CI uberjar the referenced card IS fetched and the tag
  // IS rewritten. The real cause was the port's visitQuestion — the rewrite
  // makes the loaded question dirty, so it runs via /api/dataset and the
  // saved-card wait hung, which read as a failed assertion.
  // See findings-inbox/native-subquery-ci-failure.md.
  test(
    "card reference tags should update when the name of the card changes",
    async ({ mb, page }) => {
      const { id: questionId1 } = await createNativeCard(mb.api, {
        name: "A People Question 1",
        native: { query: "SELECT id AS a_unique_column_name FROM PEOPLE" },
      });

      const tagID = `#${questionId1}`;
      const { id: questionId2 } = await createNativeCard(mb.api, {
        name: "Count of People",
        native: {
          query: `select COUNT(*) from {{#${questionId1}}}`,
          "template-tags": {
            [tagID]: {
              id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
              name: tagID,
              "display-name": tagID,
              type: "card",
              "card-id": questionId1,
            },
          },
        },
      });

      // check the original name is in the query. Not visitQuestion: the tag is
      // stored unslugged, so the rewrite makes this run ad-hoc (see above).
      await visitQuestionEitherEndpoint(page, questionId2);
      await page.getByText("Open Editor", { exact: true }).click();
      await expect(nativeEditor(page)).toBeVisible();
      await expect(nativeEditor(page)).toContainText(
        `{{#${questionId1}-a-people-question-1}}`,
      );

      // change the name
      await visitQuestion(page, questionId1);
      await page.getByText("A People Question 1", { exact: true }).click();
      const titleInput = page.getByRole("textbox", { name: "Add title" });
      await titleInput.press("End");
      await titleInput.pressSequentially(" changed");
      const renameResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/api/card/${questionId1}`,
      );
      // unfocus the input
      await page.getByText("Open Editor", { exact: true }).click();
      await renameResponse;

      // check the name has changed
      await visitQuestionEitherEndpoint(page, questionId2);
      await page.getByText("Open Editor", { exact: true }).click();
      await expect(nativeEditor(page)).toBeVisible();
      await expect(nativeEditor(page)).toContainText(
        `{{#${questionId1}-a-people-question-1-changed}}`,
      );
    },
  );
});
