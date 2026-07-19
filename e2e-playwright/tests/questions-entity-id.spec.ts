/**
 * Playwright port of e2e/test/scenarios/question/questions-entity-id.cy.spec.ts
 *
 * Loading a question by its entity id (eid) in the URL instead of the numeric
 * id — /question/entity/<eid> resolves and redirects to /question/<id>.
 *
 * Port notes:
 * - cy.url().should("contain", …) is retried in Cypress → expect.poll on
 *   page.url() (the redirect lands asynchronously after goto resolves).
 * - The "wrong request" test tracks GET /api/card/12 via page.on("request")
 *   (Cypress's cy.get("@alias.all").should("have.length", 0)) and awaits the
 *   eid-translation POST via waitForResponse registered before the goto.
 */
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import { test, expect } from "../support/fixtures";
import {
  ORDERS_QUESTION_ENTITY_ID,
  main,
} from "../support/questions-entity-id";
import { queryBuilderHeader } from "../support/ui";

test.describe("scenarios > questions > entity id support", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("/question/entity/${entity_id} should redirect to /question/${id}", async ({
    page,
  }) => {
    await page.goto(`/question/entity/${ORDERS_QUESTION_ENTITY_ID}`);
    await expect
      .poll(() => page.url())
      .toContain(`/question/${ORDERS_QUESTION_ID}`);

    // Making sure the question loads
    await expect(main(page).getByTestId("saved-question-header-title")).toHaveText(
      "Orders",
    );
  });

  test("/question/entity/${entity_id}/notebook should redirect to /question/${id}/notebook", async ({
    page,
  }) => {
    await page.goto(`/question/entity/${ORDERS_QUESTION_ENTITY_ID}/notebook`);
    await expect
      .poll(() => page.url())
      .toContain(`/question/${ORDERS_QUESTION_ID}/notebook`);

    await expect(queryBuilderHeader(page)).toContainText("Orders");
  });

  test("should not make requests to `/api/card/12` when the entity id starts with `12`", async ({
    page,
  }) => {
    const entityId = "12".padEnd(21, "x");

    // this is a request that could be made by mistake if some paths of the code
    // think that the entity id is a slug of a question
    const wrongCardRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/card/12"
      ) {
        wrongCardRequests.push(request.url());
      }
    });

    // await the entity id request to make sure the "wrong" request had its time
    // to get fired
    const entityIdRequest = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/eid-translation/translate",
    );

    await page.goto(`/question/entity/${entityId}`);

    await entityIdRequest;

    // it should render a 404 page as that entity id doesn't exist
    await expect(main(page).getByText("We're a little lost...")).toBeVisible();

    expect(wrongCardRequests).toHaveLength(0);
  });
});
