import type { FrameLocator, Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { setEmbeddingParameter } from "../support/embedding-dashboard";
import {
  createNativeQuestion,
  createNativeQuestionAndDashboard,
} from "../support/factories";
import { expect, test } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { navigateToEmbedOptionsStep } from "../support/sdk-embed-setup";
import { JWT_SHARED_SECRET, getSimpleEmbedIframe } from "../support/sdk-iframe";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  installSnowplowCapture,
} from "../support/search-snowplow";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/embed-parameters-remapping.cy.spec.ts
 *
 * Group B (the embed SETUP wizard). Consumes `support/sdk-embed-setup.ts`
 * read-only; no new shared helpers were needed, so there is no companion
 * support module — the two spec-local helpers below are the direct
 * translations of upstream's two byte-identical `beforeEach` bodies and of the
 * assertion block both tests repeat verbatim.
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` is dropped (see sdk-embed-setup.ts header):
 *   the wizard preview imports the embed runtime directly and never fetches
 *   `embed.js`; jar mode serves the real asset anyway.
 * - `createMockParameter` only fills defaults that every parameter here
 *   overrides (`id`/`name`/`slug`/`type`), so the parameters are written out
 *   inline rather than importing from metabase-types (outside this tsconfig).
 * - SNOWPLOW: not the subject (no `expectUnstructuredSnowplowEvent` anywhere),
 *   but `afterEach(H.expectNoBadSnowplowEvents)` is, so this uses
 *   `installSnowplowCapture` like its landed Group B siblings rather than rule
 *   6's no-op stub. `H.enableTracking()` is still issued so the backend state
 *   matches upstream. The bad-event check is the documented structural
 *   downgrade (no Iglu validation without micro).
 * - `cy.findAllByTestId("parameter-widget").filter(':contains("X")')` →
 *   `filter({ hasText: /X/ })`. jQuery `:contains` is a CASE-SENSITIVE
 *   substring match and Playwright's string `hasText` is case-INsensitive, so
 *   the regex form is the faithful one. ("FK" vs "PK->Name" do not collide;
 *   neither contains the other.)
 * - `cy.findByText("Add filter")` → `getByRole("button", { name: "Add filter",
 *   exact: true })`. testing-library's exact `findByText` resolves the single
 *   element whose own text is "Add filter"; Playwright's exact `getByText`
 *   compares full element text and so would match both the `<button>` and its
 *   inner span (strict-mode violation). The role query pins the same button —
 *   this is the shape the `native-filters-remapping` port already uses.
 * - `cy.findByPlaceholderText("Enter an ID").type("1,")` →
 *   `pressSequentially`: committing an ID token depends on real keystrokes
 *   (PORTING rule 5), `fill()` does not commit the trailing comma.
 * - Upstream's `H.getSimpleEmbedIframeContent().within(...)` becomes a
 *   `FrameLocator` passed to the assertion helper. The first thing both tests
 *   do inside the frame is wait for the LAST parameter widget label
 *   ("PK->Name") to be visible — upstream's own anchor against the wizard
 *   preview's mount lag, kept verbatim and load-bearing here for the same
 *   reason.
 */

const { ORDERS, PEOPLE, PRODUCTS } = SAMPLE_DATABASE;

const NATIVE_QUERY =
  "SELECT * " +
  "FROM ORDERS " +
  "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
  "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}";

const TEMPLATE_TAGS = {
  quantity: {
    id: "quantity",
    name: "quantity",
    "display-name": "Internal",
    type: "dimension",
    "widget-type": "number/=",
    dimension: ["field", ORDERS.QUANTITY, null],
  },
  product_id_fk: {
    id: "product_id_fk",
    name: "product_id_fk",
    "display-name": "FK",
    type: "dimension",
    "widget-type": "id",
    dimension: ["field", ORDERS.PRODUCT_ID, null],
  },
  user_id_pk: {
    id: "user_id_pk",
    name: "user_id_pk",
    "display-name": "PK->Name",
    type: "dimension",
    "widget-type": "id",
    dimension: ["field", PEOPLE.ID, null],
  },
};

test.describe("scenarios > embedding > sdk iframe embed setup > embed parameters", () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // Port of H.enableTracking().
    await mb.api.updateSetting("anon-tracking-enabled", true);
    await mb.api.updateSetting("enable-embedding-static", true);
    await mb.api.updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

    snowplow = await installSnowplowCapture(page, mb.baseUrl);
  });

  test.afterEach(() => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test.describe("dashboard parameter remapping", () => {
    test.beforeEach(async ({ mb }) => {
      await addRemapping(mb.api);

      const { dashcardId, cardId, dashboardId } =
        await createNativeQuestionAndDashboard(mb.api, {
          questionDetails: {
            name: "Orders native question",
            native: {
              query: NATIVE_QUERY,
              "template-tags": TEMPLATE_TAGS,
            },
          },
          dashboardDetails: {
            name: "Dashboard with Remapping",
            parameters: [
              {
                id: "quantity",
                name: "Internal",
                slug: "quantity",
                type: "number/=",
              },
              {
                id: "product_id_fk",
                name: "FK",
                slug: "product_id_fk",
                type: "id",
              },
              {
                id: "user_id_pk",
                name: "PK->Name",
                slug: "user_id_pk",
                type: "id",
              },
            ],
          },
        });

      // Connect dashboard parameters to the card's template-tags.
      await mb.api.put(`/api/dashboard/${dashboardId}`, {
        dashcards: [
          {
            id: dashcardId,
            card_id: cardId,
            row: 0,
            col: 0,
            size_x: 16,
            size_y: 8,
            parameter_mappings: [
              {
                parameter_id: "quantity",
                card_id: cardId,
                target: ["dimension", ["template-tag", "quantity"]],
              },
              {
                parameter_id: "product_id_fk",
                card_id: cardId,
                target: ["dimension", ["template-tag", "product_id_fk"]],
              },
              {
                parameter_id: "user_id_pk",
                card_id: cardId,
                target: ["dimension", ["template-tag", "user_id_pk"]],
              },
            ],
          },
        ],
      });
    });

    test("should show remapped parameter values in embed preview", async ({
      page,
    }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "dashboard",
        resourceName: "Dashboard with Remapping",
        preselectGuest: true,
      });

      await setEmbeddingParameter(page, "Internal", "Editable");
      await setEmbeddingParameter(page, "FK", "Editable");
      await setEmbeddingParameter(page, "PK->Name", "Editable");

      const frame = getSimpleEmbedIframe(page);

      // Wait for the last parameter widget to be rendered.
      await expect(frame.getByText("PK->Name", { exact: true })).toBeVisible({
        timeout: 30_000,
      });

      await assertRemappedWidgets(frame);
    });
  });

  test.describe("question parameter remapping in Guest Embed mode", () => {
    test.beforeEach(async ({ mb }) => {
      await addRemapping(mb.api);

      await createNativeQuestion(mb.api, {
        name: "Question with Remapping",
        native: {
          query: NATIVE_QUERY,
          "template-tags": TEMPLATE_TAGS,
        },
        parameters: [
          {
            id: "quantity",
            name: "Internal",
            slug: "quantity",
            type: "number/=",
            target: ["dimension", ["template-tag", "quantity"]],
          },
          {
            id: "product_id_fk",
            name: "FK",
            slug: "product_id_fk",
            type: "id",
            target: ["dimension", ["template-tag", "product_id_fk"]],
          },
          {
            id: "user_id_pk",
            name: "PK->Name",
            slug: "user_id_pk",
            type: "id",
            target: ["dimension", ["template-tag", "user_id_pk"]],
          },
        ],
      });
    });

    test("should show remapped parameter values in embed preview", async ({
      page,
    }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "chart",
        resourceName: "Question with Remapping",
        preselectGuest: true,
      });

      await setEmbeddingParameter(page, "Internal", "Editable");
      await setEmbeddingParameter(page, "FK", "Editable");
      await setEmbeddingParameter(page, "PK->Name", "Editable");

      const frame = getSimpleEmbedIframe(page);

      await expect(
        frame.getByText("Question with Remapping", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });

      // Wait for the last parameter widget to be rendered.
      await expect(frame.getByText("PK->Name", { exact: true })).toBeVisible({
        timeout: 30_000,
      });

      await assertRemappedWidgets(frame);
    });
  });
});

/**
 * Port of the field-remapping setup both `beforeEach`es duplicate verbatim:
 * internal remapping on ORDERS.QUANTITY (values 5 → "N5"), external remapping
 * ORDERS.PRODUCT_ID → PRODUCTS.TITLE.
 */
async function addRemapping(api: MetabaseApi) {
  await api.post(`/api/field/${ORDERS.QUANTITY}/dimension`, {
    name: "Quantity",
    type: "internal",
    human_readable_field_id: null,
  });

  const response = await api.get(`/api/field/${ORDERS.QUANTITY}/values`);
  const body = (await response.json()) as { values: [number][] };
  await api.post(`/api/field/${ORDERS.QUANTITY}/values`, {
    values: body.values.map(([value]) => [value, `N${value}`]),
  });

  await api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
    name: "Product ID",
    type: "external",
    human_readable_field_id: PRODUCTS.TITLE,
  });
}

/** The assertion block both tests repeat verbatim, inside the preview iframe. */
async function assertRemappedWidgets(frame: FrameLocator) {
  const widget = (label: RegExp) =>
    frame.getByTestId("parameter-widget").filter({ hasText: label });

  // internal remapping - select N5 and verify it shows N5
  await widget(/Internal/).click();
  await frame.getByText("N5", { exact: true }).click();
  await frame
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
  await expect(widget(/Internal/)).toContainText("N5");

  // FK remapping - enter ID 1 and verify product title appears
  await widget(/FK/).click();
  await frame
    .getByPlaceholder("Enter an ID", { exact: true })
    .pressSequentially("1,");
  await expect(
    frame.getByText("Rustic Paper Wallet", { exact: true }),
  ).toBeVisible();
  await frame
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
  await expect(widget(/FK/)).toContainText("Rustic Paper Wallet");

  // PK->Name remapping - enter ID 1 and verify person name appears
  await widget(/PK->Name/).click();
  await frame
    .getByPlaceholder("Enter an ID", { exact: true })
    .pressSequentially("1,");
  await expect(frame.getByText("Hudson Borer", { exact: true })).toBeVisible();
  await frame
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
  await expect(widget(/PK->Name/)).toContainText("Hudson Borer");
}
