import type { Locator, Page } from "@playwright/test";

import {
  createNativeQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { editDashboardCard } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  codeBlock,
  getEmbedSidebar,
  navigateToEmbedOptionsStep,
  navigateToEntitySelectionStep,
} from "../support/sdk-embed-setup";
import { getSimpleEmbedIframe } from "../support/sdk-iframe";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { popover } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/embed-parameters.cy.spec.ts
 *
 * Group B (the embed SETUP wizard). `support/sdk-embed-setup.ts` is consumed
 * read-only and needed no changes, so — like the `embed-parameters-remapping`
 * sibling — there is no companion support module; the two spec-local helpers
 * below are direct translations of upstream's spec-local
 * `parameterVisibilityToggle` and of the `cy.type()` call shape.
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` is dropped (see sdk-embed-setup.ts header):
 *   the wizard preview imports the embed runtime directly and never fetches
 *   `embed.js`.
 * - SNOWPLOW: not the subject (no `expectUnstructuredSnowplowEvent` here) but
 *   `afterEach(H.expectNoBadSnowplowEvents)` is, so this uses
 *   `installSnowplowCapture` like its landed Group B siblings rather than rule
 *   6's no-op stub. `H.enableTracking()` is ported as the
 *   `anon-tracking-enabled` setting so the backend state matches upstream. The
 *   bad-event check is the documented structural downgrade (no Iglu validation
 *   without micro).
 * - `parameterVisibilityToggle` upstream reads
 *   `cy.findAllByTestId("parameter-visibility-toggle").get('[data-parameter-slug=…]')`.
 *   `cy.get()` RESETS the subject — it re-queries from the current `.within()`
 *   scope, so the `findAllByTestId` half is discarded and the effective
 *   selector is just `[data-parameter-slug=…]` inside the sidebar. Ported as
 *   exactly that. (Verified against `ParameterVisibilityToggle.tsx`: the
 *   attribute lives on the same element as the testid, so the two forms
 *   resolve identically here anyway.)
 * - `cy.findByLabelText("ID").type("123")` — **`cy.type()` clicks its subject
 *   first** ("click the element first to simulate focus", cypress_runner.js)
 *   and then sends keystrokes to `document.activeElement`. That is load-bearing
 *   here: the sidebar's `getByLabel("ID")` is the popover *trigger button*
 *   (`ParameterValueWidgetTrigger`, `aria-label={placeholder}`) — probed on the
 *   jar — and typing only works because the click opens the popover and Mantine
 *   focuses the field-values input inside it. `typeIntoParameter` reproduces
 *   that literally: click the labelled element, assert an input actually took
 *   focus (PORTING rule 5 — `keyboard.type` has no retry), then type.
 *   The SQL-question case is the `noPopover` variant: the labelled element is a
 *   `<div aria-label="ID">` wrapping an inline `<input>`, and the same
 *   click-then-type sequence focuses that input. One helper covers both.
 * - `H.popover().findByText("Add filter")` → `getByRole("button", …)`.
 *   testing-library's exact `findByText` resolves the single element whose own
 *   text is "Add filter"; Playwright's exact `getByText` compares full element
 *   text and would match both the `<button>` and its inner span.
 * - `cy.get("metabase-dashboard").invoke("attr", …)` → `expect.poll` over
 *   `getAttribute`. `cy.get` retries until the custom element exists; a bare
 *   one-shot `getAttribute()` would not.
 * - ABSENCE ASSERTIONS. All three are ported as retrying `toHaveCount(0)` /
 *   `not.toContainText` (the faithful equivalents of `should("not.exist")` /
 *   `should("not.contain")`), each anchored on a positive signal so it cannot
 *   pass vacuously off a not-yet-painted preview:
 *   · "parameter widget container should not exist" — anchored on the dashcard
 *     title rendering inside the preview iframe.
 *   · "missing required parameters should be gone" — upstream asserts the
 *     positive signals ("123" / "75.41") immediately *after*; they are asserted
 *     *before* here so they anchor the absence. Same assertions, reordered.
 *   · `codeBlock().should("not.contain", "hidden-parameters=")` and
 *     `findByText("Parameters").should("not.exist")` are already anchored by
 *     upstream's own preceding positive assertions on the same element/panel.
 */

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const DASHBOARD_PARAMETERS = [
  {
    name: "ID",
    slug: "id",
    id: "11111111",
    type: "id",
  },
  {
    name: "Product ID",
    slug: "product_id",
    id: "22222222",
    type: "id",
  },
];

test.describe("scenarios > embedding > sdk iframe embed setup > embed parameters", () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // Port of H.enableTracking().
    await mb.api.updateSetting("anon-tracking-enabled", true);
    await mb.api.updateSetting("enable-embedding-simple", true);
    await mb.api.updateSetting("enable-embedding-static", false);

    snowplow = await installSnowplowCapture(page, mb.baseUrl);
  });

  test.afterEach(() => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test.describe("dashboards with parameters", () => {
    test.beforeEach(async ({ mb }) => {
      const card = await createQuestionAndDashboard(mb.api, {
        questionDetails: {
          name: "Orders table",
          query: { "source-table": ORDERS_ID },
        },
        dashboardDetails: {
          name: "Dashboard with Parameters",
          parameters: DASHBOARD_PARAMETERS,
        },
      });

      await editDashboardCard(mb.api, card, {
        parameter_mappings: DASHBOARD_PARAMETERS.map((parameter) => ({
          card_id: card.card_id,
          parameter_id: parameter.id,
          target: ["dimension", ["field", ORDERS.ID, null]],
        })),
      });
    });

    test("loads parameters into parameter settings", async ({ page }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "dashboard",
        resourceName: "Dashboard with Parameters",
        preselectSso: true,
      });

      const sidebar = getEmbedSidebar(page);

      await expect(
        sidebar.getByText("Parameters", { exact: true }),
      ).toBeVisible();

      // parameter inputs should be visible
      await expect(sidebar.getByLabel("ID", { exact: true })).toBeVisible();
      await expect(
        sidebar.getByLabel("Product ID", { exact: true }),
      ).toBeVisible();

      // parameters should be visible by default
      await expect(parameterVisibilityToggle(page, "id")).toHaveAttribute(
        "data-hidden",
        "false",
      );
      await expect(
        parameterVisibilityToggle(page, "product_id"),
      ).toHaveAttribute("data-hidden", "false");
    });

    test("can set default parameter values", async ({ page }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "dashboard",
        resourceName: "Dashboard with Parameters",
        preselectSso: true,
      });

      const frame = getSimpleEmbedIframe(page);

      // set default value for id
      await typeIntoParameter(page, "ID", "123");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await expect(
        frame
          .getByTestId("dashboard-parameters-widget-container")
          .getByLabel("ID", { exact: true }),
      ).toContainText("123");

      // set default value for product id
      await typeIntoParameter(page, "Product ID", "456");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await expect(
        frame
          .getByTestId("dashboard-parameters-widget-container")
          .getByLabel("Product ID", { exact: true }),
      ).toContainText("456");

      // both default values should be in the code snippet
      await getEmbedSidebar(page)
        .getByText("Get code", { exact: true })
        .click();
      await expect(codeBlock(page)).toContainText("initial-parameters=");
      await expect(codeBlock(page)).toContainText('"id":[123]');
      await expect(codeBlock(page)).toContainText('"product_id":[456]');

      await expect
        .poll(() =>
          parseAttribute(
            page.locator("metabase-dashboard"),
            "initial-parameters",
          ),
        )
        .toEqual({ id: [123], product_id: [456] });
    });

    test("can hide dashboard parameters", async ({ page }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "dashboard",
        resourceName: "Dashboard with Parameters",
        preselectSso: true,
      });

      const frame = getSimpleEmbedIframe(page);

      // hide both parameters
      await parameterVisibilityToggle(page, "id").click();
      await parameterVisibilityToggle(page, "product_id").click();

      // parameter widget container should not exist.
      // Anchor first on the preview having painted (see header) — a bare
      // absence check is satisfied by "nothing has rendered yet".
      await expect(frame.getByText("Orders table").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        frame.getByTestId("dashboard-parameters-widget-container"),
      ).toHaveCount(0);

      // code snippet should contain the hidden parameters
      await getEmbedSidebar(page)
        .getByText("Get code", { exact: true })
        .click();
      await expect(codeBlock(page)).toContainText("hidden-parameters=");
      await expect(codeBlock(page)).toContainText('"id"');
      await expect(codeBlock(page)).toContainText('"product_id"');

      await expect
        .poll(async () => {
          const value = await parseAttribute<string[]>(
            page.locator("metabase-dashboard"),
            "hidden-parameters",
          );
          return value === null ? null : [...value].sort();
        })
        .toEqual(["id", "product_id"]);
    });
  });

  test.describe("questions with parameters", () => {
    test.beforeEach(async ({ mb }) => {
      await createNativeQuestion(mb.api, {
        name: "Question with Parameters",
        native: {
          query: "SELECT * FROM orders WHERE id = {{id}}",
          "template-tags": {
            id: {
              id: "11111111",
              name: "id",
              "display-name": "ID",
              type: "number",
              default: null,
            },
          },
        },
      });
    });

    test("can set default parameters for SQL questions", async ({ page }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "chart",
        resourceName: "Question with Parameters",
        preselectSso: true,
      });

      const sidebar = getEmbedSidebar(page);

      await expect(
        sidebar.getByText("Parameters", { exact: true }),
      ).toBeVisible();
      await expect(sidebar.getByLabel("ID", { exact: true })).toBeVisible();

      const frame = getSimpleEmbedIframe(page);

      await expect(
        frame.getByText(/missing required parameters/).first(),
      ).toBeAttached({ timeout: 30_000 });

      await typeIntoParameter(page, "ID", "123");
      await page.keyboard.press("Tab"); // .blur() doesn't easily work here

      // Upstream asserts these two *after* the "not.exist" below; they are
      // hoisted so the absence check is anchored on a painted result grid.
      await expect(frame.getByText("123").first()).toBeVisible({
        timeout: 30_000,
      });
      // value in a subtotal field
      await expect(frame.getByText("75.41").first()).toBeVisible();

      await expect(frame.getByText(/missing required parameters/)).toHaveCount(
        0,
      );

      await getEmbedSidebar(page)
        .getByText("Get code", { exact: true })
        .click();
      await expect(codeBlock(page)).toContainText("initial-sql-parameters=");
      // not supported for questions yet
      await expect(codeBlock(page)).not.toContainText("hidden-parameters=");
      await expect(codeBlock(page)).toContainText('"id":"123"');

      await expect
        .poll(() =>
          parseAttribute(
            page.locator("metabase-question"),
            "initial-sql-parameters",
          ),
        )
        .toEqual({ id: "123" });
    });
  });

  test.describe("resources without parameters", () => {
    test("shows no parameters message for dashboards without parameters", async ({
      page,
    }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "dashboard",
        resourceName: "Orders in a dashboard",
        preselectSso: true,
      });

      await expect(
        getEmbedSidebar(page).getByText(
          "Parameters are not available for this dashboard.",
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("shows no parameters message for questions without parameters", async ({
      page,
    }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "chart",
        resourceName: "Orders, Count",
        preselectSso: true,
      });

      await expect(
        getEmbedSidebar(page).getByText(
          "Parameters are not available for this chart.",
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("should not show parameter settings for exploration template", async ({
      page,
    }) => {
      await navigateToEntitySelectionStep(page, {
        experience: "exploration",
        preselectSso: true,
      });

      const sidebar = getEmbedSidebar(page);

      // go to embed options step
      await sidebar.getByText("Next", { exact: true }).click();

      // should still contain appearance and behavior
      await expect(
        sidebar.getByText("Appearance", { exact: true }),
      ).toBeVisible();
      await expect(
        sidebar.getByText("Behavior", { exact: true }),
      ).toBeVisible();

      // should not contain parameters
      await expect(
        sidebar.getByText("Parameters", { exact: true }),
      ).toHaveCount(0);
    });
  });
});

/**
 * Port of the spec-local `parameterVisibilityToggle`. See the header: upstream's
 * `cy.get()` discards the `findAllByTestId` subject and re-queries the enclosing
 * `getEmbedSidebar().within()` scope.
 */
function parameterVisibilityToggle(page: Page, slug: string): Locator {
  return getEmbedSidebar(page).locator(`[data-parameter-slug="${slug}"]`);
}

/**
 * Port of `getEmbedSidebar().findByLabelText(<name>).type(<text>)`.
 * `cy.type()` clicks its subject before sending keystrokes to the active
 * element; both parameter widget shapes in this spec depend on that click
 * (popover trigger → autofocused field-values input; inline `noPopover` wrapper
 * → its own `<input>`). Focus is asserted before typing because
 * `keyboard.type` does not retry.
 */
async function typeIntoParameter(page: Page, label: string, text: string) {
  await getEmbedSidebar(page).getByLabel(label, { exact: true }).click();
  await expect(page.locator("input:focus")).toHaveCount(1);
  await page.keyboard.type(text);
}

async function parseAttribute<T = Record<string, unknown>>(
  locator: Locator,
  name: string,
): Promise<T | null> {
  const value = await locator.getAttribute(name);
  return value === null ? null : (JSON.parse(value) as T);
}
