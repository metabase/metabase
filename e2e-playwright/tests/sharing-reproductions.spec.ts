/**
 * Playwright port of e2e/test/scenarios/sharing/sharing-reproductions.cy.spec.js
 *
 * A reproductions file: 17 independent regression guards, kept independent
 * (the repetition IS the coverage).
 *
 * Notes on the port:
 * - The `@external` tag on several describes here means EMAIL (the maildev
 *   container), not a QA database — nothing in this spec touches an external
 *   DB. The describes that actually send mail are gated on
 *   `isMaildevRunning()`; the two that only need email *configured*
 *   (30314, 17658) use `configureSmtpSettings` instead, which writes the
 *   settings without validating a live SMTP connection, so they run
 *   unconditionally.
 * - cy.intercept(...).as() + cy.wait("@alias") → waitForResponse registered
 *   BEFORE the triggering action (porting rule 2).
 * - findByText/findByLabelText with string args are exact in testing-library
 *   → { exact: true } (rule 1); cy.contains(str) is case-sensitive substring
 *   → regex.
 * - cy.location("search").should("eq", …) retried in Cypress → expect.poll.
 * - `click({ force: true })` on a Mantine-hidden checkbox input is ported as
 *   `dispatchEvent("click")`: Playwright's force-click moves the real mouse
 *   and hits whatever is topmost, which is not what Cypress's force does.
 */
import { expect, test } from "../support/fixtures";
import { icon, modal, popover, visitDashboard, visitQuestion } from "../support/ui";
import { tooltip } from "../support/charts";
import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
  setFilter,
} from "../support/dashboard";
import { dashboardParameterSidebar, filterWidget } from "../support/dashboard-parameters";
import { updateDashboardCards } from "../support/dashboard-core";
import { editDashboardCard } from "../support/filters-repros";
import {
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
  createDashboard,
} from "../support/factories";
import { configureSmtpSettings } from "../support/admin-extras";
import {
  createQuestionAlert,
  isMaildevRunning,
  setupSMTP,
} from "../support/onboarding-extras";
import { openNewPublicLinkDropdown, sharingMenuButton } from "../support/sharing";
import { visitEmbeddedPage, visitPublicDashboard } from "../support/question-saved";
import { openLegacyStaticEmbeddingModal } from "../support/embedding-dashboard";
import { findByDisplayValue } from "../support/filters-repros";
import {
  horizontalWell,
  selectDataset,
  switchToAddMoreData,
} from "../support/visualizer-basics";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { ORDERS_DASHBOARD_DASHCARD_ID } from "../support/dashboard-core";
import {
  ADMIN,
  ADMIN_FULL_NAME,
  ADMIN_USER_ID,
  emailAttachments,
  fetchEmailAttachment,
  iframeBodyFontFamily,
  mockDashboardCard,
  mockSlackConfigured,
  openAndAddEmailsToSubscriptions,
  openDashboardSubscriptionsMenu,
  clickSend,
  sendEmailAndGetFirst,
  sendEmailAndVisitIt,
  sidebar,
} from "../support/sharing-reproductions";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID, PEOPLE } =
  SAMPLE_DATABASE;

/** The email describes need the real maildev container (SMTP :1025, web
 * :1080). A green run that silently skipped them is the failure mode we
 * report separately — see findings-inbox/sharing-reproductions.md. */
let maildevAvailable: boolean | undefined;
async function skipWithoutMaildev() {
  maildevAvailable ??= await isMaildevRunning();
  test.skip(!maildevAvailable, "maildev container not reachable");
}

test.describe("issue 18009", () => {
  test.beforeEach(async ({ mb }) => {
    await skipWithoutMaildev();
    await mb.restore();
    await mb.signInAsAdmin();

    await setupSMTP(mb.api);

    await mb.signIn("nodata");
  });

  test("nodata user should be able to create and receive an email subscription without errors (metabase#18009)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await openDashboardSubscriptionsMenu(page);

    await sidebar(page)
      .getByPlaceholder("Enter user names or email addresses")
      .click();
    // cy.contains(/^No Data/) — first match, regex.
    await popover(page).getByText(/^No Data/).first().click();

    // Click anywhere to close the popover that covers the "Send email now" button
    await page.getByText("To:", { exact: true }).click();

    const email = await sendEmailAndGetFirst(page);

    expect(email.html).not.toContain(
      "An error occurred while displaying this card.",
    );
    expect(email.html).toContain("37.65");
  });
});

test.describe("issue 18344", () => {
  test.beforeEach(async ({ page, mb }) => {
    await skipWithoutMaildev();
    await mb.restore();
    await mb.signInAsAdmin();

    await setupSMTP(mb.api);

    // Rename the question
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await editDashboard(page);

    // Open visualization options
    await page.getByTestId("dashcard").hover();
    await icon(page, "palette").click();

    const dialog = modal(page);
    const titleInput = await findByDisplayValue(dialog, "Orders");
    await titleInput.click();
    // cy.type() appends here (the caret lands at the end of the value);
    // press End explicitly so the port cannot depend on that.
    await page.keyboard.press("End");
    await titleInput.pressSequentially("Foo");
    await titleInput.blur();

    await dialog.getByRole("button", { name: "Done", exact: true }).click();

    await saveDashboard(page);
    await expect(page.getByText("OrdersFoo", { exact: true })).toBeVisible();
  });

  test("subscription should not include original question name when it's been renamed in the dashboard (metabase#18344)", async ({
    page,
  }) => {
    // Send a test email subscription
    await openDashboardSubscriptionsMenu(page);
    await page.getByText("Email it", { exact: true }).click();

    await page
      .getByPlaceholder("Enter user names or email addresses")
      .click();
    await page.getByText(ADMIN_FULL_NAME, { exact: true }).click();
    // Click this just to close the popover that is blocking the "Send email now" button
    await page.getByText("To:", { exact: true }).click();

    const email = await sendEmailAndGetFirst(page);
    expect(email.html).toContain("OrdersFoo");
  });
});

test.describe("issue 18352", () => {
  const questionDetails = {
    name: "18352",
    native: {
      query: "SELECT 'foo', 1 UNION ALL SELECT 'bar', 2",
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await skipWithoutMaildev();
    await mb.restore();
    await mb.signInAsAdmin();

    await setupSMTP(mb.api);

    const { card_id, dashboard_id } = await createNativeQuestionAndDashboard(
      mb.api,
      { questionDetails },
    );
    await visitQuestion(page, card_id);
    await visitDashboard(page, mb.api, dashboard_id);
  });

  test("should send the card with the INT64 values (metabase#18352)", async ({
    page,
  }) => {
    await openDashboardSubscriptionsMenu(page);

    await page.getByText("Email it", { exact: true }).click();

    await page.getByPlaceholder("Enter user names or email addresses").click();
    await page.getByText(ADMIN_FULL_NAME, { exact: true }).click();
    // Click this just to close the popover that is blocking the "Send email now" button
    await page.getByText("To:", { exact: true }).click();

    const { html } = await sendEmailAndGetFirst(page);

    expect(html).not.toContain("An error occurred while displaying this card.");
    expect(html).toContain("foo");
    expect(html).toContain("bar");
  });
});

test.describe("issue 18669", () => {
  const questionDetails = {
    name: "Product count",
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
    },
  };

  const filterDetails = {
    name: "Category",
    slug: "category",
    id: "c32a49e1",
    type: "category",
    default: ["Doohickey"],
  };

  const dashboardDetails = { parameters: [filterDetails] };

  test.beforeEach(async ({ page, mb }) => {
    await skipWithoutMaildev();
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await setupSMTP(mb.api);

    const card = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await editDashboardCard(mb.api, card, {
      parameter_mappings: [
        {
          parameter_id: filterDetails.id,
          card_id: card.card_id,
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        },
      ],
    });
    await visitDashboard(page, mb.api, card.dashboard_id);
  });

  test("should send a test email with non-default parameters (metabase#18669)", async ({
    page,
  }) => {
    await openDashboardSubscriptionsMenu(page);
    await page.getByText("Email it", { exact: true }).click();

    // Not getByPlaceholder: the placeholder is dropped once the first
    // recipient pill is committed, so the locator stops matching and the
    // trailing .blur() can never re-resolve it. Cypress chained on the
    // already-resolved subject; scope to the token field instead.
    const recipients = page.getByTestId("token-field").locator("input");
    await recipients.click();
    await recipients.pressSequentially(ADMIN_FULL_NAME);
    await page.keyboard.press("Enter");
    await recipients.blur();

    await sidebar(page).getByText("Doohickey", { exact: true }).click();

    await popover(page).getByText("Gizmo", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Update filter", exact: true })
      .click();

    await clickSend(page);
  });
});

test.describe("issue 20393", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show public dashboards with nested cards mapped to parameters (metabase#20393)", async ({
    page,
    mb,
  }) => {
    const q1 = await createNativeQuestion(mb.api, {
      name: "Q1",
      native: { query: 'SELECT * FROM "ORDERS"', "template-tags": {} },
    });
    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "Q2",
        query: { "source-table": `card__${q1.id}` },
      },
      dashboardDetails: { name: "Q2 in a dashboard" },
    });
    await visitDashboard(page, mb.api, dashboard_id);

    await editDashboard(page);

    await setFilter(page, "Date picker", "All Options");

    // map the date parameter to the card
    await page
      .getByTestId("dashcard-container")
      .getByText(/Select/)
      .first()
      .click();
    await popover(page).getByText(/CREATED_AT/).first().click();

    // save the dashboard
    await saveDashboard(page);

    // open the sharing modal and enable sharing, then navigate to the public link
    const uuid = await openNewPublicLinkDropdown(page, "dashboard");

    await mb.signOut();
    await page.goto(`/public/dashboard/${uuid}`);

    // verify that the card is visible on the page
    await expect(page.getByText("Q2", { exact: true }).first()).toBeVisible();
  });
});

test.describe("issue 21559", () => {
  const q1Details = {
    name: "21559-1",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
    },
    display: "scalar",
  };

  const q2Details = {
    name: "21559-2",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
    },
    display: "scalar",
  };

  test.beforeEach(async ({ page, mb }) => {
    await skipWithoutMaildev();
    await mb.restore();
    await mb.signInAsAdmin();

    await setupSMTP(mb.api);

    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: q1Details,
    });
    await createQuestion(mb.api, q2Details);

    await visitDashboard(page, mb.api, dashboard_id);
    await expect(page.getByTestId("scalar-value")).toHaveText("80.52");
    await editDashboard(page);
  });

  test("should respect dashboard card visualization (metabase#21559)", async ({
    page,
  }) => {
    await getDashboardCard(page, 0).hover();
    await getDashboardCard(page, 0)
      .getByLabel("Visualize another way", { exact: true })
      .click();

    const dialog = modal(page);
    await switchToAddMoreData(page);
    await selectDataset(page, q2Details.name);
    await expect(dialog.getByText("80.52", { exact: true }).first()).toBeAttached();
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(2);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();

    // Make sure visualization changed to funnel
    await expect(
      getDashboardCard(page, 0).getByText("80.52", { exact: true }).first(),
    ).toBeAttached();
    await expect(
      getDashboardCard(page, 0).locator("polygon[fill='#509EE2']").first(),
    ).toBeAttached();

    await saveDashboard(page);

    // Wait for "Edited a few seconds ago" to disappear because the whole
    // dashboard re-renders after that!
    //
    // Upstream is `should("not.be.visible")`. That label is hidden by
    // `opacity: 0` (DashboardHeaderView.module.css .HeaderLastEditInfoLabel,
    // flipped 4s after mount by the showSubHeader timer). Cypress counts
    // opacity:0 as hidden; Playwright's toBeVisible only checks the box +
    // `visibility`, so the faithful port asserts the computed opacity. The
    // mouse is parked first: `:hover` on the header pins opacity back to 1,
    // and Playwright (unlike Cypress) leaves the real cursor wherever the
    // last click landed.
    await page.mouse.move(0, 0);
    await expect
      .poll(
        () =>
          page
            .getByTestId("revision-history-button")
            .evaluate((element) => window.getComputedStyle(element).opacity),
        { timeout: 15_000 },
      )
      .toBe("0");

    await openAndAddEmailsToSubscriptions(page, [ADMIN_FULL_NAME]);

    const email = await sendEmailAndGetFirst(page);
    expect(email.html).toContain("img"); // Funnel is sent as img (inline attachment)
    expect(email.html).not.toContain("80.52"); // Scalar displays its value in HTML
  });
});

test.describe("issue 22524", () => {
  const questionDetails = {
    name: "22524 question",
    native: {
      query: "select * from people where city = {{city}}",
      "template-tags": {
        city: {
          id: "6d077d39-a420-fd14-0b0b-a5eb611ce1e0",
          name: "city",
          "display-name": "City",
          type: "text",
        },
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("update dashboard cards when changing parameters on publicly shared dashboards (metabase#22524)", async ({
    page,
    mb,
  }) => {
    const { dashboard_id } = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails,
    });
    await visitDashboard(page, mb.api, dashboard_id);

    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");

    await page.getByText("Select…", { exact: true }).click();
    await popover(page).getByText(/City/).first().click();

    await saveDashboard(page);

    // Share dashboard
    const uuid = await openNewPublicLinkDropdown(page, "dashboard");

    await mb.signOut();
    await page.goto(`/public/dashboard/${uuid}`);

    // Set parameter value. Not getByPlaceholder("Text"): the widget drops its
    // placeholder as soon as it takes focus, so the locator stops matching
    // after the click — Cypress kept chaining on the resolved subject.
    const textFilter = filterWidget(page).getByRole("textbox");
    await textFilter.click();
    await textFilter.fill("");
    await textFilter.pressSequentially("Rye");
    await page.keyboard.press("Enter");

    // Check results.
    //
    // Scoped to the dashcard, not page-wide. MEASURED: page-wide this resolves
    // to TWO `[data-testid=cell-data]` divs with identical text — the on-screen
    // cell, and the data-grid's off-screen width-measurement clone, which
    // `createMeasurementContainer` / `useBodyCellMeasure` append to
    // `document.body` (visibility:hidden at -9999px) and tear down a tick
    // later. Cypress's `findByText` retries through the transient
    // "found multiple elements" error until the clone unmounts; Playwright's
    // `toBeVisible()` does NOT retry through a strict-mode violation — it
    // throws immediately, which is why this read as a deterministic failure.
    // The clones live outside the dashcard, so scoping removes the ambiguity
    // without weakening the assertion.
    await expect(
      getDashboardCard(page).getByText("2-7900 Cuerno Verde Road", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue 24223", () => {
  const questionDetails = {
    name: "24223",
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
  };

  const dropdownFilter = {
    name: "Category",
    slug: "category",
    id: "b613dce5",
    type: "string/=",
    sectionId: "string",
    default: ["Doohickey"],
  };

  const containsFilter = {
    name: "Title",
    slug: "title",
    id: "ffb5da68",
    type: "string/contains",
    sectionId: "string",
    default: ["Awesome"],
  };

  const dashboardDetails = { parameters: [dropdownFilter, containsFilter] };

  test.beforeEach(async ({ mb }) => {
    await skipWithoutMaildev();
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await setupSMTP(mb.api);
  });

  test("should clear default filter (metabase#24223)", async ({ page, mb }) => {
    const dashboardCard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    const { card_id, dashboard_id } = dashboardCard;

    await editDashboardCard(mb.api, dashboardCard, {
      parameter_mappings: [
        {
          parameter_id: dropdownFilter.id,
          card_id,
          target: [
            "dimension",
            [
              "field",
              PRODUCTS.CATEGORY,
              { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
            ],
          ],
        },
        {
          parameter_id: containsFilter.id,
          card_id,
          target: [
            "dimension",
            [
              "field",
              PRODUCTS.TITLE,
              { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
            ],
          ],
        },
      ],
    });

    await visitDashboard(page, mb.api, dashboard_id);
    await expect
      .poll(() => new URL(page.url()).search)
      .toBe("?category=Doohickey&title=Awesome");
    await expect(page.getByTestId("dashcard")).toContainText("36.37");

    await openAndAddEmailsToSubscriptions(page, [ADMIN_FULL_NAME]);

    const categoryWidget = filterWidget(
      page.getByTestId("subscription-parameters-section"),
      { name: "Category" },
    );
    await categoryWidget.hover();
    await icon(categoryWidget, "close").click();

    await sidebar(page).getByRole("button", { name: "Done", exact: true }).click();

    const pulseCard = page.getByLabel("Pulse Card", { exact: true });
    await expect(pulseCard).toContainText("Title: Awesome");
    await expect(pulseCard).not.toContainText("1 more filter");
    await pulseCard.click();

    await sendEmailAndVisitIt(page);

    const header = page.locator("table.header");
    await expect(header).toContainText(containsFilter.name);
    await expect(header).toContainText("Awesome");
    await expect(header).not.toContainText(dropdownFilter.name);
    await expect(header).not.toContainText("Doohickey");
  });
});

test.describe("issue 25473", () => {
  const ccName = "CC Reviewer";

  const dashboardFilter = {
    name: "Text ends with",
    slug: "text_ends_with",
    id: "3a8ecdbd",
    type: "string/ends-with",
    sectionId: "string",
  };

  const questionDetails = {
    name: "25473",
    query: {
      "source-table": REVIEWS_ID,
      expressions: { [ccName]: ["field", REVIEWS.REVIEWER, null] },
      limit: 10,
      // Let's show only a few columns to make it easier to focus on the UI
      fields: [
        ["field", REVIEWS.REVIEWER, null],
        ["field", REVIEWS.RATING, null],
        ["field", REVIEWS.CREATED_AT, null],
        ["expression", ccName, null],
      ],
    },
  };

  const dashboardDetails = {
    name: "25473D",
    parameters: [dashboardFilter],
  };

  async function assertOnResults(page: import("@playwright/test").Page) {
    await expect(
      page.getByRole("columnheader").filter({ visible: true }).last(),
    ).toHaveText(ccName);
    await expect(page.getByText("xavier", { exact: true })).toHaveCount(2);

    await filterWidget(page).click();
    const input = page.getByPlaceholder("Enter some text");
    await input.click();
    await input.pressSequentially("e");
    await input.blur();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect
      .poll(() => new URL(page.url()).search)
      .toBe(`?${dashboardFilter.slug}=e`);
    await expect(page.getByText("xavier", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("cameron.nitzsche", { exact: true }),
    ).toHaveCount(2);
  }

  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
      mb.api,
      { questionDetails, dashboardDetails },
    );

    await mb.api.put(`/api/dashboard/${dashboard_id}`, {
      dashcards: [
        {
          id,
          card_id,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          series: [],
          visualization_settings: {},
          parameter_mappings: [
            {
              parameter_id: dashboardFilter.id,
              card_id,
              target: ["dimension", ["expression", ccName, null]],
            },
          ],
        },
      ],
    });

    dashboardId = dashboard_id;
  });

  test("public sharing: dashboard text filter on a custom column should accept text input (metabase#25473-1)", async ({
    page,
    mb,
  }) => {
    await visitPublicDashboard(page, mb, dashboardId);

    await assertOnResults(page);
  });

  test("signed embedding: dashboard text filter on a custom column should accept text input (metabase#25473-2)", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      embedding_params: { [dashboardFilter.slug]: "enabled" },
      enable_embedding: true,
    });

    await visitEmbeddedPage(page, mb, {
      resource: { dashboard: dashboardId },
      params: {},
    });

    await assertOnResults(page);
  });
});

test.describe("issue 26988", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should apply embedding settings passed in URL on load", async ({
    page,
    mb,
  }) => {
    const card = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "Q1",
        query: { "source-table": ORDERS_ID, limit: 3 },
      },
      dashboardDetails: { enable_embedding: true },
    });

    await visitDashboard(page, mb.api, card.dashboard_id);

    const previewDashboard = page.waitForResponse((response) =>
      /^\/api\/preview_embed\/dashboard\//.test(
        new URL(response.url()).pathname,
      ),
    );

    await openLegacyStaticEmbeddingModal(page, mb.api, {
      resource: "dashboard",
      resourceId: card.dashboard_id,
      activeTab: "lookAndFeel",
      previewMode: "preview",
    });

    await previewDashboard;

    await expect(
      page.frameLocator("iframe").getByTestId("embed-frame"),
    ).toBeAttached();
    await expect
      .poll(() => iframeBodyFontFamily(page))
      .toBe("Lato, Arial, sans-serif");

    const fontControl = page
      .getByLabel("Customizing look and feel", { exact: true })
      .getByLabel("Font", { exact: true });
    await fontControl.click();
    await popover(page).getByText("Oswald", { exact: true }).click();

    await expect
      .poll(() => iframeBodyFontFamily(page))
      .toBe('Oswald, "Roboto Condensed", sans-serif');

    await fontControl.click();
    await popover(page).getByText("Slabo 27px", { exact: true }).click();

    await expect
      .poll(() => iframeBodyFontFamily(page))
      .toBe('"Slabo 27px", "Roboto Slab", serif');
  });
});

test.describe("issue 30314", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // The Cypress original calls H.setupSMTP, but this test never sends mail —
    // it only needs email to be CONFIGURED so the "Email it" channel renders.
    // configureSmtpSettings writes the settings without live-validating, so
    // the test runs with or without the maildev container.
    await configureSmtpSettings(mb.api);
  });

  test("should clean the new subscription form on cancel (metabase#30314)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await openDashboardSubscriptionsMenu(page);

    const aside = sidebar(page);
    await aside.getByText("Email it", { exact: true }).click();

    const attachResults = aside.getByLabel("Attach results", { exact: true });
    await expect(attachResults).not.toBeChecked();
    // Input is placed behind the label due to tooltip in label.
    await attachResults.dispatchEvent("click");

    const questionsToAttach = aside.getByLabel("Questions to attach", {
      exact: true,
    });
    await expect(questionsToAttach).not.toBeChecked();
    await questionsToAttach.dispatchEvent("click");

    await aside.getByRole("button", { name: "Cancel", exact: true }).click();
    await aside.getByText("Email it", { exact: true }).click();

    await expect(
      aside.getByLabel("Attach results", { exact: true }),
    ).not.toBeChecked();
    await expect(
      aside.getByText("Questions to attach", { exact: true }),
    ).toHaveCount(0);
    await expect(aside.getByText(".xlsx", { exact: true })).toHaveCount(0);
    await expect(aside.getByText(".csv", { exact: true })).toHaveCount(0);
  });
});

test.describe("issue 17657", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await mb.api.post("/api/pulse", {
      name: "Orders in a dashboard",
      cards: [
        {
          id: ORDERS_QUESTION_ID,
          collection_id: null,
          description: null,
          display: "table",
          name: "Orders",
          include_csv: false,
          include_xls: false,
          dashboard_card_id: 1,
          dashboard_id: ORDERS_DASHBOARD_ID,
          parameter_mappings: [],
        },
      ],
      channels: [
        {
          channel_type: "email",
          enabled: true,
          // Since the fix (https://github.com/metabase/metabase/pull/17668),
          // this is not even possible to do in the UI anymore. The backend
          // still doesn't validate, so we make sure the FE handles a
          // subscription with no recipients gracefully.
          recipients: [],
          details: {},
          schedule_type: "monthly",
          schedule_day: "mon",
          schedule_hour: 8,
          schedule_frame: "first",
        },
      ],
      skip_if_empty: false,
      collection_id: null,
      parameters: [],
      dashboard_id: ORDERS_DASHBOARD_ID,
    });
  });

  test("frontend should gracefully handle the case of a subscription without a recipient (metabase#17657)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await openDashboardSubscriptionsMenu(page);

    await page.getByText(/^Emailed monthly/).first().click();

    await expect(
      sidebar(page).getByRole("button", { name: "Done", exact: true }),
    ).toBeDisabled();

    // Open the popover with all users
    await page.getByPlaceholder("Enter user names or email addresses").click();
    // Pick admin as a recipient
    await page.getByText(ADMIN_FULL_NAME, { exact: true }).click();

    await expect(
      sidebar(page).getByRole("button", { name: "Done", exact: true }),
    ).toBeEnabled();
  });
});

test.describe("issue 17658", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // The Cypress original calls H.setupSMTP; this test only deletes a
    // subscription and never sends mail, so the non-validating settings
    // write is enough (and keeps the test off the maildev gate).
    await configureSmtpSettings(mb.api);

    const collections = (await (
      await mb.api.get("/api/collection/tree?tree=true")
    ).json()) as { id: number; name: string }[];
    const { id } = collections.find(
      (collection) => collection.name === "First collection",
    )!;

    // Move dashboard
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      collection_id: id,
    });

    // Create subscription
    await mb.api.post("/api/pulse", {
      name: "Orders in a dashboard",
      cards: [
        {
          id: ORDERS_QUESTION_ID,
          collection_id: null,
          description: null,
          display: "table",
          name: "Orders",
          include_csv: false,
          include_xls: false,
          dashboard_card_id: ORDERS_DASHBOARD_DASHCARD_ID,
          dashboard_id: ORDERS_DASHBOARD_ID,
          parameter_mappings: [],
        },
      ],
      channels: [
        {
          channel_type: "email",
          enabled: true,
          recipients: [
            {
              id: ADMIN_USER_ID,
              email: ADMIN.email,
              first_name: ADMIN.first_name,
              last_name: ADMIN.last_name,
              common_name: ADMIN_FULL_NAME,
            },
          ],
          details: {},
          schedule_type: "monthly",
          schedule_day: "mon",
          schedule_hour: 8,
          schedule_frame: "first",
        },
      ],
      skip_if_empty: false,
      collection_id: id,
      parameters: [],
      dashboard_id: ORDERS_DASHBOARD_ID,
    });
  });

  test("should delete dashboard subscription from any collection (metabase#17658)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await openDashboardSubscriptionsMenu(page);

    await page.getByText(/^Emailed monthly/).first().click();

    await page.getByText("Delete this subscription", { exact: true }).click();
    await page
      .getByText(/^This dashboard will no longer be emailed to/)
      .first()
      .click();

    const deletePulse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/pulse\/\d+$/.test(new URL(response.url()).pathname),
    );
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    const response = await deletePulse;
    const body = (await response.json()) as { cause?: unknown };
    expect(body.cause).toBeUndefined();
    expect(response.status()).not.toBe(500);

    await expect(
      page.getByRole("button", { name: "Delete", exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 17547", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
      breakout: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
      ],
      aggregation: [["count"]],
    },
    display: "area",
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mockSlackConfigured(page, mb.api);

    const { id: questionId } = await createQuestion(mb.api, questionDetails);
    await createQuestionAlert(mb.api, {
      user_id: ADMIN_USER_ID,
      card_id: questionId,
      handlers: [
        {
          channel_type: "channel/slack",
          recipients: [
            {
              type: "notification-recipient/raw-value",
              details: { value: "#work" },
            },
          ],
        },
      ],
    });

    await visitQuestion(page, questionId);
  });

  test("editing an alert should not delete it (metabase#17547)", async ({
    page,
  }) => {
    await page.getByLabel("Move, trash, and more…", { exact: true }).click();
    await popover(page).getByText("Edit alerts", { exact: true }).click();

    const alertTime = modal(page).getByText("Check daily at 9:00 AM", {
      exact: true,
    });
    await expect(alertTime).toBeVisible();
    await alertTime.click();

    await modal(page).getByText("PM", { exact: true }).click();

    const alertQuery = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/notification\/\d+$/.test(new URL(response.url()).pathname),
    );
    await modal(page)
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await alertQuery;

    await expect(
      page
        .getByTestId("toast-undo")
        .getByText("Your alert was updated.", { exact: true })
        .first(),
    ).toBeVisible();

    await expect(
      modal(page).getByText("Check daily at 9:00 PM", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 16108", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should display a tooltip for CTA icons on an individual question (metabase#16108)", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await icon(page, "download").first().hover();
    await expect(
      tooltip(page).getByText("Download results", { exact: true }),
    ).toBeAttached();
    await sharingMenuButton(page).hover();
    await expect(
      tooltip(page).getByText("Share", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 49525", () => {
  const q1Details = {
    name: "Pivot Table",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["datetime-field", ["field-id", PRODUCTS.CREATED_AT], "year"],
        ["field-id", PRODUCTS.CATEGORY],
      ],
    },
    display: "pivot",
    visualization_settings: {
      "pivot_table.column_split": {
        rows: ["CREATED_AT"],
        columns: ["CATEGORY"],
        values: ["COUNT"],
      },
      "table.column_formatting": [
        {
          type: "single",
          columns: ["count"],
          color: "#84BB4C",
          operator: ">",
          value: 10,
        },
      ],
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await skipWithoutMaildev();
    await mb.restore();
    await mb.signInAsAdmin();

    await setupSMTP(mb.api);

    const { dashboard_id } = await createQuestionAndDashboard(mb.api, {
      questionDetails: q1Details,
    });
    await visitDashboard(page, mb.api, dashboard_id);
  });

  test("Subscriptions with 'Keep the data pivoted' checked should work (metabase#49525)", async ({
    page,
  }) => {
    // Send a test email subscription
    await openDashboardSubscriptionsMenu(page);
    const aside = sidebar(page);
    await aside.getByText("Email it", { exact: true }).click();
    await aside
      .getByPlaceholder("Enter user names or email addresses")
      .click();

    await popover(page).getByText(ADMIN_FULL_NAME, { exact: true }).click();

    // Click this just to close the popover that is blocking the "Send email now" button
    await aside.getByText("To:", { exact: true }).click();
    const attachResults = aside.getByLabel("Attach results", { exact: true });
    await expect(attachResults).not.toBeChecked();
    // Input is placed behind the label due to tooltip in label.
    await attachResults.dispatchEvent("click");
    await aside.getByText("Keep the data pivoted", { exact: true }).click();
    await aside.getByText("Questions to attach", { exact: true }).click();

    const email = await sendEmailAndGetFirst(page);

    // Get the CSV attachment data
    const csvAttachment = emailAttachments(email).find(
      (attachment) => attachment.contentType === "text/csv",
    );
    expect(csvAttachment).toBeTruthy();

    const raw = await fetchEmailAttachment(
      email.id,
      csvAttachment!.generatedFileName,
    );
    // CSV exports begin with a UTF-8 BOM; strip it, and tolerate either
    // \n or \r\n line endings, before asserting on the header row.
    const headers = raw.replace(/^﻿/, "").split(/\r?\n/)[0];
    expect(headers).toBe(
      "Created At: Year,Doohickey,Gadget,Gizmo,Widget,Row totals",
    );
  });

  test("renders the pivot table inline in the subscription email body (UXW-4378)", async ({
    page,
  }) => {
    await openDashboardSubscriptionsMenu(page);
    const aside = sidebar(page);
    await aside.getByText("Email it", { exact: true }).click();
    await aside
      .getByPlaceholder("Enter user names or email addresses")
      .click();

    await popover(page).getByText(ADMIN_FULL_NAME, { exact: true }).click();

    // Close the recipient popover so the send button is clickable
    await aside.getByText("To:", { exact: true }).click();

    await sendEmailAndVisitIt(page);

    const container = page.locator(".container");
    // Transposed pivot: row dimension as the top-left label, categories across
    // the top, a grand-totals column appended, and no internal pivot-grouping
    // column.
    await expect(
      container.getByText("Created At: Year", { exact: true }),
    ).toBeAttached();
    for (const category of ["Doohickey", "Gadget", "Gizmo", "Widget"]) {
      await expect(
        container.getByText(category, { exact: true }),
      ).toBeAttached();
    }
    await expect(
      container.getByText("Row totals", { exact: true }),
    ).toBeAttached();
    await expect(container.getByText(/pivot-grouping/)).toHaveCount(0);

    // Conditional formatting (count > 10 -> green) colors only the larger
    // value cells: the 8 cell stays transparent, the 200 grand total is green.
    await expect
      .poll(() => cellBackgroundColor(container, /^8$/))
      .toBe("rgba(0, 0, 0, 0)");
    await expect
      .poll(() => cellBackgroundColor(container, /^200$/))
      .toBe("rgba(132, 187, 76, 0.65)");
  });

  async function cellBackgroundColor(
    container: import("@playwright/test").Locator,
    text: RegExp,
  ): Promise<string> {
    const cell = container.locator("td").filter({ hasText: text }).first();
    return await cell.evaluate(
      (element) => window.getComputedStyle(element).backgroundColor,
    );
  }
});

test.describe("issue 54603", () => {
  const FILTER_PARAMETER = {
    id: "54603-cat",
    name: "Category",
    slug: "category",
    type: "category",
  };

  const PRODUCT_CATEGORY_FIELD_REF = [
    "field",
    PRODUCTS.CATEGORY,
    { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
  ];

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashboard = await createDashboard(mb.api, {
      name: "Dashboard 54603",
      parameters: [FILTER_PARAMETER],
    });

    await updateDashboardCards(mb.api, {
      dashboard_id: dashboard.id,
      cards: [
        mockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          parameter_mappings: [
            {
              parameter_id: FILTER_PARAMETER.id,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                PRODUCT_CATEGORY_FIELD_REF,
                { "stage-number": 0 },
              ],
            },
          ],
        }),
      ],
    });

    // Subscription bound to the Category filter — removing it should warn.
    await mb.api.post("/api/pulse", {
      name: "Weekly Category Roundup",
      dashboard_id: dashboard.id,
      cards: [
        { id: ORDERS_QUESTION_ID, include_csv: false, include_xls: false },
      ],
      channels: [
        { enabled: true, channel_type: "slack", schedule_type: "hourly" },
      ],
      parameters: [FILTER_PARAMETER],
    });

    await visitDashboard(page, mb.api, dashboard.id);
  });

  test("warns before removing a filter that has active subscriptions (metabase#54603)", async ({
    page,
    mb,
  }) => {
    await editDashboard(page);

    await page
      .getByTestId("fixed-width-filters")
      .getByText("Category", { exact: true })
      .click();

    // The Remove button stays disabled until the subscriptions query resolves.
    const removeButton = dashboardParameterSidebar(page).getByRole("button", {
      name: "Remove",
      exact: true,
    });
    await expect(removeButton).toBeEnabled();
    await removeButton.click();

    const dialog = modal(page);
    await expect(
      dialog.getByText("Remove this filter?", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText(/active subscription/i).first()).toBeVisible();
    await expect(dialog.getByText(/archive/i).first()).toBeVisible();

    // Cancel keeps the filter.
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(
      page
        .getByTestId("fixed-width-filters")
        .getByText("Category", { exact: true }),
    ).toBeVisible();

    // Try again and confirm — filter is removed.
    await dashboardParameterSidebar(page)
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await modal(page)
      .getByRole("button", { name: "Remove filter", exact: true })
      .click();

    // The sidebar closes when the parameter is removed.
    await expect(page.getByTestId("dashboard-parameter-sidebar")).toHaveCount(0);

    // Saving triggers server-side archival of any subscription referencing the
    // removed parameter.
    await saveDashboard(page);

    // Backend anchor, ADDED to the port. Upstream's only check here is the
    // sidebar assertion below, and mutation testing showed it is VACUOUS:
    // this subscription is never listed in that panel at all (its sole
    // channel is Slack, which this describe never configures — measured, the
    // sidebar renders just the word "Subscriptions" while GET /api/pulse
    // still returns the subscription). So it passes whether or not the
    // archival happened. Same semantics in Cypress, so it is vacuous
    // upstream too. Measured control: GET /api/pulse returns the
    // subscription before this save and [] after it.
    await expect
      .poll(async () => {
        const pulses = (await (await mb.api.get("/api/pulse")).json()) as {
          name: string;
        }[];
        return pulses.map((pulse) => pulse.name);
      })
      .not.toContain("Weekly Category Roundup");

    await openDashboardSubscriptionsMenu(page);
    await expect(
      sidebar(page).getByText("Weekly Category Roundup", { exact: true }),
    ).toHaveCount(0);
  });

  test("removes a filter immediately when no subscription references it (metabase#54603)", async ({
    page,
    mb,
  }) => {
    // Replace the existing subscription with one that does NOT include the filter.
    const pulses = (await (await mb.api.get("/api/pulse")).json()) as {
      id: number;
    }[];
    for (const pulse of pulses) {
      await mb.api.put(`/api/pulse/${pulse.id}`, {
        ...pulse,
        parameters: [],
      });
    }

    await editDashboard(page);

    await page
      .getByTestId("fixed-width-filters")
      .getByText("Category", { exact: true })
      .click();
    const removeButton = dashboardParameterSidebar(page).getByRole("button", {
      name: "Remove",
      exact: true,
    });
    await expect(removeButton).toBeEnabled();
    await removeButton.click();

    // No modal — the filter is gone right away (sidebar closes too).
    await expect(
      page.getByRole("dialog", { name: /remove this filter/i }),
    ).toHaveCount(0);
    await expect(page.getByTestId("dashboard-parameter-sidebar")).toHaveCount(0);
  });
});
