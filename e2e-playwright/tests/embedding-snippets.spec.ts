/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embedding-snippets.cy.spec.js — the legacy
 * static-embedding modal's generated code snippets: the server-side (Node.js /
 * Ruby / Python / Clojure) and client-side (Mustache / Pug-Jade / ERB / JSX)
 * language pickers, the generated signed-URL + iframe code, the params baked
 * into the snippet, and (Pro/EE) the download-toggle effect on the snippet plus
 * the highlighted-diff persistence across tab switches.
 *
 * Porting notes:
 * - Runs once per token ([plans=starter] and [plans=pro-self-hosted]), matching
 *   the upstream `tokens.forEach`. Each describe activates the token; the jar is
 *   EE so both resolve. Skip-gated on resolveToken(token) (embedding-questions
 *   precedent). `defaultDownloadsValue` is true for pro-self-hosted, undefined
 *   otherwise; the download-toggle assertions only run for pro-self-hosted.
 * - Upstream passes `acceptTerms: false` to H.openLegacyStaticEmbeddingModal —
 *   the helper has no such option (dead arg), so it's a no-op; the port uses the
 *   helper's default unpublishBeforeOpen: true, matching upstream behaviour.
 * - codeBlock() is cy.get(".cm-content"); the generated snippet is read via
 *   textContent() and matched against the getEmbeddingJsCode regex / IFRAME_CODE
 *   exactly as upstream's `.invoke("text").should("match"|"have.text")`.
 * - The Look-and-Feel appearance toggles (background / downloads) are
 *   visually-hidden inputs Mantine parks outside the viewport → dispatched click
 *   (toggleAppearanceControl), same as public-sharing-embed-button-behavior.
 * - getEmbeddingJsCode / IFRAME_CODE are ported (typed) into
 *   support/embedding-snippets.ts rather than imported from the shared JS.
 */
import { resolveToken } from "../support/api";
import { selectDropdown } from "../support/dashboard";
import { openLegacyStaticEmbeddingModal } from "../support/embedding";
import {
  IFRAME_CODE,
  backendSelectButton,
  codeBlock,
  frontendSelectButton,
  getEmbeddingJsCode,
  highlightedTexts,
  toggleAppearanceControl,
} from "../support/embedding-snippets";
import { test, expect } from "../support/fixtures";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "../support/sample-data";
import { modal, visitDashboard, visitQuestion } from "../support/ui";

const tokens = ["starter", "pro-self-hosted"] as const;

for (const token of tokens) {
  test.describe(`[plans=${token}] scenarios > embedding > code snippets`, () => {
    test.skip(!resolveToken(token), `Requires the ${token} token`);

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken(token);
    });

    test("dashboard should have the correct embed snippet", async ({
      page,
      mb,
    }) => {
      const defaultDownloadsValue =
        token === "pro-self-hosted" ? true : undefined;
      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "dashboard",
        resourceId: ORDERS_DASHBOARD_ID,
      });

      await expect(
        modal(page).getByText(
          "To embed this dashboard in your application you’ll just need to publish it, and paste these code snippets in the proper places in your app.",
        ),
      ).toBeVisible();
      await expect(
        modal(page).getByText(
          "Insert this code snippet in your server code to generate the signed embedding URL",
        ),
      ).toBeVisible();

      expect(await codeBlock(page).first().textContent()).toMatch(
        getEmbeddingJsCode({
          type: "dashboard",
          id: ORDERS_DASHBOARD_ID,
          downloads: defaultDownloadsValue,
        }),
      );

      await expect(backendSelectButton(page).first()).toHaveValue("Node.js");
      await backendSelectButton(page).first().click();

      const backendDropdown = selectDropdown(page);
      await expect(backendDropdown).toContainText("Node.js");
      await expect(backendDropdown).toContainText("Ruby");
      await expect(backendDropdown).toContainText("Python");
      await expect(backendDropdown).toContainText("Clojure");

      await expect(codeBlock(page).last()).toHaveText(IFRAME_CODE);

      await expect(frontendSelectButton(page).first()).toHaveValue("Pug / Jade");
      await frontendSelectButton(page).first().click();

      const frontendDropdown = selectDropdown(page);
      await expect(frontendDropdown).toContainText("Mustache");
      await expect(frontendDropdown).toContainText("Pug / Jade");
      await expect(frontendDropdown).toContainText("ERB");
      await expect(frontendDropdown).toContainText("JSX");

      await modal(page)
        .getByRole("tab", { name: "Look and Feel", exact: true })
        .click();

      // set transparent background metabase#23477
      await toggleAppearanceControl(page, "Dashboard background");
      expect(await codeBlock(page).first().textContent()).toMatch(
        getEmbeddingJsCode({
          type: "dashboard",
          id: ORDERS_DASHBOARD_ID,
          background: false,
          downloads: defaultDownloadsValue,
        }),
      );

      if (token === "pro-self-hosted") {
        // Disable both download options
        await toggleAppearanceControl(page, "Export to PDF");
        await toggleAppearanceControl(page, "Results (csv, xlsx, json, png)");

        expect(await codeBlock(page).first().textContent()).toMatch(
          getEmbeddingJsCode({
            type: "dashboard",
            id: ORDERS_DASHBOARD_ID,
            background: false,
            downloads: false,
          }),
        );

        // Verify that switching tabs keeps the highlighted texts
        await expect(highlightedTexts(page)).toHaveCount(1);

        await modal(page)
          .getByRole("tab", { name: "Parameters", exact: true })
          .click();
        await modal(page)
          .getByRole("tab", { name: "Look and Feel", exact: true })
          .click();

        await expect(highlightedTexts(page)).toHaveCount(1);
      }
    });

    test("question should have the correct embed snippet", async ({
      page,
      mb,
    }) => {
      const defaultDownloadsValue =
        token === "pro-self-hosted" ? true : undefined;
      await visitQuestion(page, ORDERS_QUESTION_ID);
      await openLegacyStaticEmbeddingModal(page, mb.api, {
        resource: "question",
        resourceId: ORDERS_QUESTION_ID,
      });

      await expect(
        modal(page).getByText(
          "To embed this question in your application you’ll just need to publish it, and paste these code snippets in the proper places in your app.",
        ),
      ).toBeVisible();
      await expect(
        modal(page).getByText(
          "Insert this code snippet in your server code to generate the signed embedding URL",
        ),
      ).toBeVisible();

      expect(await codeBlock(page).first().textContent()).toMatch(
        getEmbeddingJsCode({
          type: "question",
          id: ORDERS_QUESTION_ID,
          downloads: defaultDownloadsValue,
        }),
      );

      await modal(page)
        .getByRole("tab", { name: "Look and Feel", exact: true })
        .click();

      // hide download button for pro/enterprise users metabase#23477
      if (token === "pro-self-hosted") {
        await toggleAppearanceControl(page, "Download (csv, xlsx, json, png)");

        expect(await codeBlock(page).first().textContent()).toMatch(
          getEmbeddingJsCode({
            type: "question",
            id: ORDERS_QUESTION_ID,
            downloads: false,
          }),
        );
      }

      await expect(backendSelectButton(page).first()).toHaveValue("Node.js");
      await backendSelectButton(page).first().click();

      const backendDropdown = selectDropdown(page);
      await expect(backendDropdown).toContainText("Node.js");
      await expect(backendDropdown).toContainText("Ruby");
      await expect(backendDropdown).toContainText("Python");
      await expect(backendDropdown).toContainText("Clojure");

      if (token === "pro-self-hosted") {
        // Verify that switching tabs keeps the highlighted texts
        await expect(highlightedTexts(page)).toHaveCount(1);

        await modal(page)
          .getByRole("tab", { name: "Parameters", exact: true })
          .click();
        await modal(page)
          .getByRole("tab", { name: "Look and Feel", exact: true })
          .click();

        await expect(highlightedTexts(page)).toHaveCount(1);
      }
    });
  });
}
