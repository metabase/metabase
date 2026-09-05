import type { FrameLocator, Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { uploadTranslationDictionaryViaAPI } from "../support/content-translation-dashboards";
import { createDashboard, createQuestion } from "../support/factories";
import { expect, test } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  getNewEmbedConfigurationScript,
  getNewEmbedScriptTag,
  getSimpleEmbedIframe,
  loadSdkIframeEmbedTestPage,
  prepareSdkIframeEmbedTest,
  visitCustomHtmlPage,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import {
  prepareGuestEmbedSdkIframeEmbedTest,
  signGuestJwt,
} from "../support/sdk-iframe-guest-token-refresh";
import { modal } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding/content-translations.cy.spec.ts
 *
 * (Group A — the embed.js harness, `support/sdk-iframe.ts`, consumed read-only.
 * No harness change and no new companion support module were needed.)
 *
 * Port notes:
 *
 * - Everything this spec needs already existed. `uploadTranslationDictionaryViaAPI`
 *   comes from `support/content-translation-dashboards.ts` (the landed
 *   non-embed content-translation ports); `prepareGuestEmbedSdkIframeEmbedTest`
 *   and the general-payload HS256 signer come from
 *   `support/sdk-iframe-guest-token-refresh.ts`. Nothing new was written to
 *   `support/`.
 *
 * - `H.getSignedJwtForResource({ resourceId, resourceType: "question" })`
 *   (e2e-embedding-helpers.js:408) signs `{ resource: { question: id }, params,
 *   iat, exp }` with `JWT_SHARED_SECRET` over HS256 — byte-for-byte the payload
 *   `signGuestJwt({ questionId, expirationSeconds })` already produces (it, too,
 *   sets `iat` explicitly; see PORTING). Its default is 10 minutes → 600s.
 *
 * - `setupEmbed` is spec-local upstream and stays spec-local, the same shape the
 *   landed `metabase-browser` / `view-and-curate-content` ports use.
 *   `H.getSimpleEmbedIframeContent()` blocks until the embed iframe exists and
 *   its body is non-empty; `getSimpleEmbedIframe` returns a lazy `FrameLocator`
 *   immediately, so `waitForSimpleEmbedIframesToLoad` restores that gate.
 *
 * - `findByText` with a string arg is EXACT in testing-library (rule 1) →
 *   `{ exact: true }` throughout.
 *
 * - The "textContent() on an iframe body also reads injected <style>" hazard
 *   does not apply here: every assertion in this spec is an element-level
 *   `getByText`, never a whole-body text read. Recorded as checked, not as a
 *   finding.
 *
 * - No absence assertions anywhere in this spec — every check is a positive
 *   "the translated string is visible", which is the shape the absence-rule
 *   guidance asks a translation spec to prefer anyway.
 *
 * - `cy.intercept(...).as("getDictionary")` + `cy.wait` → a
 *   `page.waitForResponse` armed BEFORE the page load (rule 2). It must be
 *   armed before, not after: `waitForResponse` does not consume past responses,
 *   and the dictionary fetch happens during the embed's first render.
 *
 * - The guest describe carries `{ tags: "@EE" }` upstream. The spike backend is
 *   always the EE jar and this test activates a bleeding-edge token itself, so
 *   there is nothing to gate on. 3 tests, 3 executed, 0 skipped.
 */

const { ORDERS_ID } = SAMPLE_DATABASE;

/** Port of the spec-local `setupEmbed` (note the `locale: "de"` config). */
async function setupEmbed(
  page: Page,
  mb: Parameters<typeof visitCustomHtmlPage>[1],
  elementHtml: string,
): Promise<FrameLocator> {
  await visitCustomHtmlPage(
    page,
    mb,
    `
      ${getNewEmbedScriptTag(mb)}
      ${getNewEmbedConfigurationScript(mb, { locale: "de" })}
      ${elementHtml}
    `,
  );

  await waitForSimpleEmbedIframesToLoad(page);

  return getSimpleEmbedIframe(page);
}

/** Port of H.entityPickerModal, scoped. The shared `notebook.ts` copy takes a
 * `Page`; upstream calls it inside `getSimpleEmbedIframeContent().within(...)`,
 * where its `cy.findByTestId` resolves against the iframe body. */
function entityPickerModal(scope: FrameLocator): Locator {
  return scope.getByTestId("entity-picker-modal");
}

test.describe("scenarios > embedding > sdk iframe embedding > content-translations", () => {
  test.describe("metabase-browser", () => {
    /** Port of the spec-local `setupContentTranslations`. Returns the
     * collection id, which upstream stashes in the `@collectionId` alias. */
    async function setupContentTranslations(
      api: MetabaseApi,
    ): Promise<number> {
      // H.createCollection posts name/description/parent_id/authority_level;
      // the shared `createCollection` ports only name/parent_id, and the
      // description is a translated string this spec depends on.
      const response = await api.post("/api/collection", {
        name: "Test Collection",
        description: "Test description",
        parent_id: null,
        authority_level: null,
      });
      const collection = (await response.json()) as { id: number };

      await createDashboard(api, {
        name: "Test Dashboard",
        description: "Dashboard description text",
        collection_id: collection.id,
      });

      await createQuestion(api, {
        name: "Test Question",
        description: "Question description text",
        collection_id: collection.id,
        query: {
          "source-table": ORDERS_ID,
          limit: 1,
        },
      });

      await uploadTranslationDictionaryViaAPI(api, [
        { locale: "de", msgid: "Test Collection", msgstr: "Test Sammlung" },
        {
          locale: "de",
          msgid: "Test description",
          msgstr: "Testbeschreibung",
        },
        {
          locale: "de",
          msgid: "Test Dashboard",
          msgstr: "Test Armaturenbrett",
        },
        {
          locale: "de",
          msgid: "Dashboard description text",
          msgstr: "Armaturenbrett Beschreibungstext",
        },
        { locale: "de", msgid: "Test Question", msgstr: "Testfrage" },
        {
          locale: "de",
          msgid: "Question description text",
          msgstr: "Frage Beschreibungstext",
        },
      ]);

      return collection.id;
    }

    test("should translate content with read-only='true'", async ({
      page,
      mb,
    }) => {
      await prepareSdkIframeEmbedTest(page, mb, {
        withToken: "bleeding-edge",
        signOut: false,
      });

      const collectionId = await setupContentTranslations(mb.api);

      const frame = await setupEmbed(
        page,
        mb,
        `
          <metabase-browser
            initial-collection="${collectionId}"
            read-only="true"
          />
        `,
      );

      await expect(
        frame
          .getByTestId("sdk-breadcrumbs")
          .getByText("Test Sammlung", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      const collectionTable = frame.getByTestId("collection-table");
      await expect(
        collectionTable.getByText("Test Armaturenbrett", { exact: true }),
      ).toBeVisible();

      const question = collectionTable.getByText("Testfrage", { exact: true });
      await expect(question).toBeVisible();
      await question.click();

      const breadcrumbs = frame.getByTestId("sdk-breadcrumbs");
      await expect(
        breadcrumbs.getByText("Test Sammlung", { exact: true }),
      ).toBeVisible();
      await expect(
        breadcrumbs.getByText("Testfrage", { exact: true }),
      ).toBeVisible();
    });

    test("should translate content with read-only='false'", async ({
      page,
      mb,
    }) => {
      await prepareSdkIframeEmbedTest(page, mb, {
        withToken: "bleeding-edge",
        signOut: false,
      });

      const collectionId = await setupContentTranslations(mb.api);

      const frame = await setupEmbed(
        page,
        mb,
        `
          <metabase-browser
            initial-collection="${collectionId}"
            read-only="false"
          />
        `,
      );

      await expect(
        frame.getByText("Testfrage", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });

      const newDashboard = frame.getByText("Neues Dashboard", { exact: true });
      await expect(newDashboard).toBeVisible();
      await newDashboard.click();

      const collectionPickerButton = modal(frame).getByText("Test Sammlung", {
        exact: true,
      });
      await expect(collectionPickerButton).toBeVisible();
      await collectionPickerButton.click();

      await expect(
        entityPickerModal(frame).getByText("Test Sammlung", { exact: true }),
      ).toBeVisible();
    });
  });

  // Regression test for EMB-1478: a guest embed under a non-English instance
  // locale used to fire setEndpointsForAuthEmbedding() on the first render
  // (before isGuestEmbed had propagated through the redux store), corrupting
  // the dictionary endpoint to the auth path. The signed-out guest visitor
  // then got 401s on /api/ee/content-translation/dictionary and the title
  // never translated.
  test.describe("guest embed (EMB-1478)", () => {
    test("translates question title for a signed-out guest when site-locale is non-English", async ({
      page,
      mb,
    }) => {
      let questionId = 0;

      await prepareGuestEmbedSdkIframeEmbedTest(mb, {
        onPrepare: async () => {
          // Required to trigger the bug: useLocale() returns the instance
          // locale on the first render, and the buggy code path only fires
          // when that value is non-English.
          await mb.api.updateSetting("site-locale", "de");

          await uploadTranslationDictionaryViaAPI(mb.api, [
            {
              locale: "de",
              msgid: "EMB-1478 question",
              msgstr: "EMB-1478 Frage",
            },
          ]);

          // `embedding_type` is deliberately not passed: upstream's
          // `question()` helper never forwards it (it PUTs only
          // `{ type, enable_embedding, embedding_params }`), so the card
          // upstream creates carries only `enable_embedding: true`.
          const question = await createQuestion(mb.api, {
            name: "EMB-1478 question",
            enable_embedding: true,
            query: {
              "source-table": ORDERS_ID,
              limit: 1,
            },
          });
          questionId = question.id;
        },
      });

      const token = signGuestJwt({
        questionId,
        // H.getSignedJwtForResource defaults to expirationMinutes: 10.
        expirationSeconds: 60 * 10,
      });

      // Regex (not glob) so the matcher covers both /dictionary?... and
      // /dictionary/<jwt>?... — minimatch's `*` does not cross `/`.
      // Armed before the load, awaited after (rule 2).
      const dictionaryRequest = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          /\/api\/ee\/content-translation\/dictionary(\/|\?)/.test(
            response.url(),
          ),
        { timeout: 60_000 },
      );

      const frame = await loadSdkIframeEmbedTestPage(page, mb, {
        metabaseConfig: { isGuest: true },
        elements: [
          {
            component: "metabase-question",
            attributes: {
              token,
              "with-title": true,
            },
          },
        ],
      });

      // The dictionary fetch must include the JWT segment. Without the fix
      // it would hit /dictionary?locale=de and return 401 for the guest.
      const dictionaryResponse = await dictionaryRequest;
      expect(dictionaryResponse.url()).toContain(`/dictionary/${token}`);

      await expect(
        frame.getByText("EMB-1478 Frage", { exact: true }),
      ).toBeVisible({ timeout: 40_000 });
    });
  });
});
