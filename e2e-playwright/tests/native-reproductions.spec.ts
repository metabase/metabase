/**
 * Playwright port of e2e/test/scenarios/native/native-reproductions.cy.spec.ts
 *
 * NOTE ON THE SOURCE FILE: the upstream directory holds BOTH
 * `native-reproductions.cy.spec.ts` and `native-reproductions.cy.spec.js`, and
 * they are disjoint specs. This is the **.ts** one (issues 11727, 16584,
 * 38083, 33327, 49454, 48712, 53194, 53299, 53171, 54124, 52811/52812, 52806,
 * 55951, 54799, 56570, 53649, 57441, 56905, 57644, 51679, 59110, 59356,
 * 63711, 66745, 51717, 59075, 69160). The `.js` sibling is NOT ported here.
 *
 * A reproductions file is many independent regression guards; the describes
 * are kept 1:1 with upstream and nothing is merged.
 *
 * Infra tiers actually present in this file (see findings-inbox):
 * - 22 tests need only the H2 sample DB → they RUN on the bare jar.
 * - 4 tests need the QA Postgres container + its `postgres-12` /
 *   `postgres-writable` snapshots (11727, 55951, 57644-multi, 59356).
 * - 1 test needs the QA Mongo container + `mongo-5` (53299).
 *   All 5 gate on the deliberate PW_QA_DB_ENABLED (the bare QA_DB_ENABLED
 *   leaks truthy from cypress.env.json — PORTING wave 12).
 *   Note 55951 and 57644-multi carry no upstream tag at all yet restore
 *   `postgres-12`; the tag is not a reliable tier signal.
 *
 * Porting notes:
 * - `cy.realPress([H.metaKey, "Enter"])` → `keyboard.press("ControlOrMeta+Enter")`
 *   ("ControlOrMeta" resolves to Meta on macOS, Control elsewhere — the same
 *   split `e2e-browser-helpers.ts metaKey` makes).
 * - `H.NativeEditor.type()` escapes `{{` into two literal `{` and drives the
 *   rest through cypress-real-events (CDP). `page.keyboard.type` is the same
 *   CDP path, so plain strings port verbatim: typing `{` twice with
 *   close-brackets on yields `{{}}` in both harnesses.
 * - `H.NativeEditor.completions()` takes NO argument and
 *   `H.NativeEditor.completion(label)` is `cy.get(".cm-completionLabel")
 *   .contains(label).parent()` — an unscoped, case-sensitive substring
 *   first-match. The shared `nativeEditorCompletion` scopes to the tooltip and
 *   returns all matches, so `.first()` reproduces the Cypress subject.
 * - `H.NativeEditor.type(text, { allowFastSet: true })` is NOT typing: it
 *   writes `.cm-content`'s text directly and then types " {backspace}" to
 *   wake the validator. Ported verbatim as `fastSetNativeEditor` — the strings
 *   it is used for are exactly the ones close-brackets/autocomplete would
 *   mangle.
 * - Cypress `.trigger("mousedown"/"mousemove"/"mouseup")` is a synthetic
 *   MouseEvent dispatch, not a real drag (`triggerMouseEvent`).
 * - Absence assertions taken straight after an action are anchored on a
 *   discriminating signal before the check, per PORTING's "absence assertions
 *   are vacuous inside a mount-lag window"; each anchor is commented inline.
 */
import { test, expect } from "../support/fixtures";
import { createQuestion } from "../support/factories";
import { openVizSettingsSidebar, leftSidebar, tooltip } from "../support/charts";
import { runNativeQuery } from "../support/models";
import {
  adhocQuestionHash,
  focusNativeEditor,
  nativeEditor,
  nativeEditorCompletion,
  nativeEditorCompletions,
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import { createNativeCard, createSnippet } from "../support/native-extras";
import {
  blurNativeEditor,
  clientRect,
  createCard,
  createTestNativeQuery,
  fastSetNativeEditor,
  findOverflowingDescendants,
  getRunQueryButton,
  nativeEditorDataSource,
  outerSize,
  pressNextCompletion,
  repeatAssertion,
  selectAllInNativeEditor,
  startNewNativeModel,
  startNewNativeQuestionWithoutDatabase,
  triggerMouseEvent,
  expectNotDirty,
} from "../support/native-reproductions";
import { queryBuilderMain } from "../support/notebook";
import { rightSidebar } from "../support/question-saved";
import { questionInfoButton, sidesheet } from "../support/revisions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import { icon, modal, newButton, popover, visitQuestion } from "../support/ui";
import { WRITABLE_DB_ID } from "../support/schema-viewer";

const { ORDERS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const QA_DB_SKIP_REASON =
  "Requires the QA Postgres container and its postgres-12 / postgres-writable snapshots (set PW_QA_DB_ENABLED)";
const MONGO_SKIP_REASON =
  "Requires the mongo QA database and its mongo-5 snapshot (set PW_QA_DB_ENABLED)";

test.describe("issue 11727", { tag: "@external" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  const PG_DB_ID = 2;

  const questionDetails = {
    dataset_query: {
      type: "native",
      database: PG_DB_ID,
      native: {
        query: "SELECT pg_sleep(10)",
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  test("should cancel the native query via the keyboard shortcut (metabase#11727)", async ({
    page,
  }) => {
    // PORTING rule 2: the wait is registered before the navigation that fires it.
    const databases = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/database",
    );
    await page.goto(`/question#${adhocQuestionHash(questionDetails)}`);
    await databases;

    // H.runNativeQuery({ wait: false }): click play, skip the dataset wait,
    // but keep the helper's trailing "not dirty" check.
    await icon(page.getByTestId("native-query-editor-container"), "play").click();
    await expectNotDirty(page);

    await expect(
      queryBuilderMain(page).getByText("Doing science...", { exact: true }),
    ).toBeVisible();

    await page.keyboard.press("ControlOrMeta+Enter");

    await expect(
      queryBuilderMain(page).getByText("Here's where your results will appear", {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test.describe("issue 16584", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should pass parameters when running with 'Run select text' (metabase#16584)", async ({
    page,
  }) => {
    // The bug described in is #16584 can be further simplified:
    // - the issue persists even when selecting the *entire* query
    // - the issue is unrelated to using a date filter, using a text filter works too
    // - the issue is unrelated to whether or not the parameter is required or if default value is set
    // - the space at the end of the query is not needed to reproduce this issue
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "SELECT COUNTRY FROM ACCOUNTS WHERE COUNTRY = {{ country }} LIMIT 1",
    );
    await selectAllInNativeEditor(page);

    // cy.type() clicks its subject first and then sends keystrokes to
    // document.activeElement (PORTING batch-12). Do NOT re-resolve the input by
    // its placeholder afterwards: the native parameter widget drops the
    // placeholder attribute once the field is focused, so a second lookup finds
    // nothing (measured — this is what made the first run fail).
    const countryInput = page.getByPlaceholder("Country");
    await expect(countryInput).toBeVisible();
    await countryInput.click();
    await page.keyboard.type("NL");

    await selectAllInNativeEditor(page);
    await runNativeQuery(page);

    await expect(
      page.getByTestId("query-visualization-root").getByText("NL", { exact: true }),
    ).toHaveCount(1);
  });
});

test.describe("issue 38083", () => {
  const QUERY = {
    database: SAMPLE_DB_ID,
    query: "select * from people where state = {{ state }} limit 1",
    templateTags: {
      state: {
        type: "text",
        name: "state",
        "display-name": "State",
        "widget-type": "string/=",
        default: "CA",
        required: true,
      },
    },
  } as const;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show the revert to default icon when the default value is selected (metabase#38083)", async ({
    mb,
    page,
  }) => {
    const dataset_query = await createTestNativeQuery(mb.api, QUERY);
    const card = await createCard(mb.api, {
      name: "SQL query with a date parameter",
      dataset_query,
    });
    await visitQuestion(page, card.id);

    // Upstream is `H.filterWidget().filter(':contains("State")').icon("revert")
    // .should("not.exist")`. `findAllByTestId` carries an implicit existence
    // requirement that a bare toHaveCount(0) drops (PORTING), and without an
    // anchor the absence would also pass before the widget painted — so assert
    // the widget itself first, then the absence of its revert icon.
    const stateWidget = page
      .getByTestId("parameter-widget")
      .filter({ hasText: caseSensitiveSubstring("State") });
    await expect(stateWidget).toBeVisible();
    await expect(icon(stateWidget, "revert")).toHaveCount(0);
  });
});

test.describe("issue 33327", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should recover from a visualization error (metabase#33327)", async ({
    mb,
    page,
  }) => {
    const query = "SELECT 1";
    const card = await createNativeCard(mb.api, {
      native: { query },
      display: "scalar",
    });
    await visitQuestion(page, card.id);

    await expect(page.getByTestId("scalar-value")).toHaveText("1");

    await page.getByTestId("visibility-toggler").click();
    await expect(nativeEditor(page)).toContainText(query);

    // {leftarrow}-- : the caret lands at the end of the line, so this inserts
    // the comment marker directly before the "1".
    await focusNativeEditor(page);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("--", { delay: 10 });

    await expect(nativeEditor(page)).toBeVisible();
    await expect(nativeEditor(page)).toContainText("SELECT --1");

    let dataset = waitForDataset(page);
    await getRunQueryButton(page).click();
    await dataset;

    const visualizationRoot = page.getByTestId("visualization-root");
    await expect(icon(visualizationRoot, "warning")).toBeVisible();
    await expect(visualizationRoot.getByTestId("scalar-value")).toHaveCount(0);

    await expect(nativeEditor(page)).toContainText("SELECT --1");

    await focusNativeEditor(page);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");

    await expect(nativeEditor(page)).toContainText(query);

    dataset = waitForDataset(page);
    await getRunQueryButton(page).click();
    await dataset;

    await expect(page.getByTestId("scalar-value")).toHaveText("1");
    await expect(icon(page.getByTestId("visualization-root"), "warning")).toHaveCount(
      0,
    );
  });
});

test.describe("issue 49454", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await createQuestion(mb.api, {
      name: "Test Metric 49454",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    });
    await createQuestion(mb.api, {
      name: "Test Question 49454",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    });
  });

  test("should be possible to use metrics in native queries (metabase#49454, metabase#51035)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    // should not show empty tooltip (metabase#51035)
    const saveButton = page.getByRole("button", { name: "Save", exact: true });
    await expect(saveButton).toBeVisible();
    await saveButton.hover();
    // Anchor: Mantine's Tooltip opens after a delay, so a bare absence check
    // right after hover() could pass before it would have appeared. 1s is well
    // clear of the default open delay (and of the ~100ms transition), so an
    // empty tooltip WOULD be mounted by now if the bug were present. Proven
    // load-bearing by mutation (see findings-inbox/native-reproductions.md).
    await page.waitForTimeout(1000);
    await expect(tooltip(page)).toHaveCount(0);

    await typeInNativeEditor(page, "select * from {{ #test");

    await expect(nativeEditorCompletions(page)).toBeVisible();
    await expect(
      nativeEditorCompletion(page, "-question-49454").first(),
    ).toBeVisible();
    await expect(
      nativeEditorCompletion(page, "-metric-49454").first(),
    ).toBeVisible();
  });
});

test.describe("issue 48712", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not reset the suggestions when the query is edited (metabase#48712)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    await typeInNativeEditor(page, "pro");
    await expect(nativeEditorCompletion(page, "PRODUCTS").first()).toBeVisible();

    await focusNativeEditor(page);
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await typeInNativeEditor(page, "select * from pro");

    await expect(nativeEditorCompletion(page, "PRODUCTS").first()).toBeVisible();

    // `{nextcompletion}` with `{ focus: false }` — no editor click first.
    //
    // Upstream is a single cmd/ctrl+j. Measured on the jar: the FIRST Mod-j
    // after the completion tooltip appears is silently dropped (the keydown
    // reaches the document with defaultPrevented=false, so CodeMirror's
    // `moveCompletionSelection` declined it — the completion source is still
    // recomputing), while a second press ~400ms later moves the selection
    // 0 → 1 exactly as intended. Cypress's per-command queue latency always
    // covered that window; `page.keyboard` has none.
    //
    // Ported as PORTING's sanctioned re-nudge (`pressArrowUntilActive`):
    // press only while PROCEDURE is NOT selected, so a dropped press is
    // retried and a landed one cannot overshoot.
    await expect(async () => {
      const procedure = nativeEditorCompletion(page, "PROCEDURE").first();
      if ((await procedure.getAttribute("aria-selected")) === null) {
        await pressNextCompletion(page);
        await page.waitForTimeout(300);
      }
      // One-arg `have.attr` asserts PRESENCE; CodeMirror sets aria-selected
      // only on the active option, so this is a real "PROCEDURE is selected"
      // check (verified by probe: PRODUCTS carries it before the press).
      await expect(procedure).toHaveAttribute("aria-selected", {
        timeout: 2000,
      });
    }).toPass({ timeout: 20_000 });

    // wait for all completions to finish
    await page.waitForTimeout(1000);
    await expect(
      nativeEditorCompletion(page, "PROCEDURE").first(),
    ).toHaveAttribute("aria-selected");
  });
});

test.describe("issue 53194", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    for (const fieldId of Object.values(REVIEWS)) {
      await mb.api.put(`/api/field/${fieldId}`, {
        visibility_type: "sensitive",
      });
    }
  });

  test("should not enter an infinite loop when browsing table fields (metabase#53194)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    const sidebar = page.getByTestId("sidebar-content");
    const sidebarTitle = page.getByTestId("sidebar-header-title");

    // ANCHOR (see findings-inbox): the sidebar's table page renders its title
    // immediately and its column list only after GET /api/table/:id/query_metadata
    // resolves. Anchoring on the title alone — which is all the DOM offers at
    // that moment — makes the "ID should not exist" check pass BEFORE the
    // columns would have painted. Measured with the fields left un-sensitive:
    // toHaveCount(0) still passed (mutant survived), while the settled sidebar
    // does contain "ID". Cypress's `should("not.exist")` has the same
    // first-absent-observation semantics, so this is vacuous UPSTREAM too — not
    // port drift. Anchored here on the metadata response plus the table
    // description, which renders in both variants and so proves the page body
    // (columns section included) has rendered.
    const reviewsMetadata = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        `/api/table/${REVIEWS_ID}/query_metadata`,
    );
    await sidebar.getByText("REVIEWS", { exact: true }).click(); // the infinite loop used to start with this action
    await reviewsMetadata;
    await expect(sidebarTitle).toHaveText("REVIEWS");
    await expect(
      sidebar.getByText(/Reviews that Sample Company customers/),
    ).toBeVisible();

    await expect(sidebar.getByText("ID", { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText("ORDERS", { exact: true })).toHaveCount(0);

    await sidebarTitle.click(); // if app is frozen, Playwright won't be able to execute this
    // Anchor: back on the table list — "REVIEWS" is the discriminating signal
    // and is asserted by upstream one line later; assert it before the absence.
    await expect(sidebar.getByText("REVIEWS", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("ID", { exact: true })).toHaveCount(0);

    await sidebar.getByText("ORDERS", { exact: true }).click();
    await expect(sidebar.getByText("ID", { exact: true })).toBeVisible();
  });
});

test.describe("issue 53299", { tag: "@mongo" }, () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, MONGO_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("mongo-5");
    await mb.signInAsAdmin();
  });

  test("should be possible to switch to mongodb when editing an sql question (metabase#53299)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    // H.selectNativeEditorDataSource("QA Mongo")
    await nativeEditorDataSource(page).click();
    await popover(page).getByText("QA Mongo", { exact: true }).click();

    await expect(nativeEditorDataSource(page)).toContainText("QA Mongo");
  });
});

test.describe("issue 53171", () => {
  let longNameQuestionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const card = await createQuestion(mb.api, {
      name: `Question ${"a".repeat(100)}`,
      query: { "source-table": ORDERS_ID },
    });
    longNameQuestionId = card.id;
  });

  test("title and icons in data reference sidebar should not overflow (metabase#53171)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    await typeInNativeEditor(page, `{{#${longNameQuestionId}`);

    const sidebar = page.getByTestId("sidebar-content");
    // Anchor the `.within()` subject: the Cypress chain errors if
    // sidebar-content / sidebar-header don't exist, and the overflow check is
    // vacuous against an unpainted sidebar.
    await expect(sidebar).toBeVisible();
    await expect(page.getByTestId("sidebar-header")).toBeVisible();

    // The Cypress original is a retried `.should(cb)`.
    await expect(async () => {
      const problems = await findOverflowingDescendants(
        page,
        "sidebar-content",
        "sidebar-header",
      );
      expect(problems).toEqual([]);
    }).toPass({ timeout: 10_000 });

    await verifyIconVisibleAndSized("chevronleft", 16);
    await verifyIconVisibleAndSized("table", 16);
    await verifyIconVisibleAndSized("close", 18);

    // `cy.icon(name).should("be.visible")` inside `.within()` is an ANY-of-set
    // assertion (PORTING rule 3), and the `.and(cb)` that follows measures the
    // FIRST element of the same set.
    async function verifyIconVisibleAndSized(iconName: string, size: number) {
      const icons = icon(sidebar, iconName);
      await expect(icons.filter({ visible: true }).first()).toBeVisible();
      const { width, height } = await outerSize(icons.first());
      expect(width).toBe(size);
      expect(height).toBe(size);
    }
  });
});

test.describe("issue 54124", () => {
  let questionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const card = await createQuestion(mb.api, {
      name: "Reference Question",
      query: { "source-table": ORDERS_ID },
    });
    questionId = card.id;
  });

  test("should be possible to close the data reference sidebar (metabase#54124)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    const sidebar = page.getByTestId("sidebar-content");
    await expect(sidebar).toBeVisible();
    await icon(sidebar, "close").click();

    await fastSetNativeEditor(page, `{{#${questionId}-reference-question }}`);

    await focusNativeEditor(page);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");

    await expect(sidebar).toBeVisible();
    await icon(sidebar, "close").click();

    await expect(sidebar).toHaveCount(0);

    // moving cursor should open the reference sidebar again
    await focusNativeEditor(page);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(sidebar).toBeVisible();
  });
});

test.describe("issues 52811, 52812", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("popovers should close when clicking outside (metabase#52811, metabase#52812)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "{{x");
    await page.getByLabel("Variable type").click();

    // popover should close when clicking away (metabase#52811)
    await popover(page).getByText("Field Filter", { exact: true }).click();
    await clickAway(page);
    // `cy.get(POPOVER_ELEMENT)` — the UNFILTERED selector, which is what makes
    // this a real check (the shared `popover()` filters to visible ones).
    await expect(page.locator(POPOVER_ELEMENT)).toHaveCount(0);

    // the default value input should not be rendered when 'Field to map to' is
    // not set yet (metabase#52812)
    // Anchor: the sidebar is the thing that just re-rendered; "Select..." (the
    // unset "Field to map to" trigger) is present in the buggy variant too and
    // is clicked three lines below, so it proves the render completed.
    await expect(
      page.getByTestId("sidebar-content").getByText("Select...", { exact: true }),
    ).toBeVisible();
    await expect(
      rightSidebar(page).getByText("Default filter widget value", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Always require a value")).toHaveCount(0);

    // existing popover should close when opening a new one (metabase#52811)
    await page
      .getByTestId("sidebar-content")
      .getByText("Select...", { exact: true })
      .click();
    await page.getByLabel("Variable type").click();
    const popovers = page.locator(POPOVER_ELEMENT);
    await expect(popovers).toHaveCount(1);
    await expect(popovers).toContainText("Field Filter");
    await expect(popovers).not.toContainText("Sample Database");
  });
});

test.describe("issue 52806", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should remove parameter values from the URL when leaving the query builder and discarding changes (metabase#52806)", async ({
    page,
  }) => {
    await page.goto("/");
    await newButton(page).click();
    await popover(page).getByText("SQL query", { exact: true }).click();

    await focusNativeEditor(page);
    await typeInNativeEditor(page, "select {{x}}");

    // cy.location().should(...) retries — expect.poll, not a one-shot read.
    await expect
      .poll(() => new URL(page.url()).search)
      .toBe("?x=");

    await page.getByTestId("main-logo-link").click();
    await modal(page)
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect.poll(() => new URL(page.url()).search).toBe("");
  });
});

test.describe("issue 55951", () => {
  // Untagged upstream, but it restores `postgres-12` and asserts on
  // "QA Postgres12" — it needs the QA container just as much as the @external
  // describes do.
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  test("should not show loading state in database picker when databases are being reloaded (metabase#55951)", async ({
    page,
  }) => {
    // The Cypress beforeEach intercept: rewrite every database's
    // initial_sync_status to "incomplete".
    await page.route("**/api/database", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data = mockResponseData(body.data);
      await route.fulfill({ response, json: body });
    });

    const databases = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/database",
    );
    await page.goto("/");
    await databases;

    // The second intercept: same rewrite, plus a 2s delay so the loading state
    // is guaranteed to be observable if the bug is present. Playwright runs the
    // LAST-registered handler first, matching Cypress's later-intercept-wins.
    await page.route("**/api/database*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data = mockResponseData(body.data);
      // Setting this to be arbitrarily long so that repeatAssertion is
      // guaranteed to detect the issue
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({ response, json: body });
    });

    await newButton(page).click();
    await popover(page).getByText("SQL query", { exact: true }).click();

    const databasePicker = popover(page);
    await expect(databasePicker).toBeVisible();
    await expect(
      databasePicker.getByText("QA Postgres12", { exact: true }),
    ).toBeVisible();
    await expect(
      databasePicker.getByText("Sample Database", { exact: true }),
    ).toBeVisible();

    await repeatAssertion(page, async () => {
      await expect(
        databasePicker.getByTestId("loading-indicator"),
      ).toHaveCount(0, { timeout: 250 });
    });
  });

  function mockResponseData(databases: { [key: string]: unknown }[]) {
    return databases.map((database) => ({
      ...database,
      initial_sync_status: "incomplete" as const,
    }));
  }
});

test.describe("issue 54799", () => {
  const questionDetails = {
    native: {
      query: "select 'foo', 'bar'",
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const card = await createNativeCard(mb.api, questionDetails);
    await visitQuestion(page, card.id);
  });

  test("it should be possible to select multiple ranges and run those (metabase#54799)", async ({
    page,
  }) => {
    await page.getByTestId("visibility-toggler").click();

    const cells = page.locator("[data-testid=cell-data]");
    await expect(cells.filter({ hasText: /^foo$/ }).first()).toBeVisible();
    await expect(cells.filter({ hasText: /^bar$/ }).first()).toBeVisible();

    // `el.dblclick(pos, H.holdMetaKey)` — cmd/ctrl+double-click adds a range to
    // CodeMirror's multi-selection. Cypress's "left"/"right" positions are the
    // element-relative edges (x = 0 / x = width - 1) at mid-height.
    await select(nativeEditor(page).getByText("select", { exact: true }));
    await select(nativeEditor(page).getByText("'foo'", { exact: true }));
    await select(nativeEditor(page).getByText("'foo'", { exact: true }), "left");
    await select(nativeEditor(page).getByText("'bar'", { exact: true }));
    await select(nativeEditor(page).getByText("'bar'", { exact: true }), "right");

    await getRunQueryButton(page).click();

    // Not vacuous despite following an unwaited click: the PREVIOUS results
    // contain foo/bar, so these can only pass once the new results render.
    await expect(cells.filter({ hasText: /^foo$/ })).toHaveCount(0);
    await expect(cells.filter({ hasText: /^bar$/ })).toHaveCount(0);

    await expect(cells.filter({ hasText: /^'foobar'$/ }).first()).toBeVisible();
    await expect(cells.filter({ hasText: /foobar/ }).first()).toBeVisible();

    async function select(
      locator: ReturnType<typeof nativeEditor>,
      position: "center" | "left" | "right" = "center",
    ) {
      // Cypress's position math, verified against its dist bundle
      // (packages/runner coordinates.ts getCoordsByPosition):
      //   left   → x = ceil(rect.left)
      //   center → x = floor(rect.left + rect.width / 2)
      //   right  → x = floor(rect.left + rect.width) - 1
      //   y (all three are yPosition "center") → floor(rect.top + rect.height/2)
      // Those are ABSOLUTE viewport coords; Playwright's `position` is relative
      // to the padding box, so subtract the rect origin. The rounding matters:
      // on a fractional span origin a plain x = 0 lands on the boundary between
      // the preceding token and this one, and CodeMirror's word-select then
      // grabs the whitespace instead of the leading quote (measured — the run
      // executed `select foobar'`, one quote short).
      const rect = await clientRect(locator);
      const absoluteX =
        position === "left"
          ? Math.ceil(rect.x)
          : position === "right"
            ? Math.floor(rect.x + rect.width) - 1
            : Math.floor(rect.x + rect.width / 2);
      const absoluteY = Math.floor(rect.y + rect.height / 2);
      await locator.dblclick({
        modifiers: ["ControlOrMeta"],
        position: { x: absoluteX - rect.x, y: absoluteY - rect.y },
      });
    }
  });
});

test.describe("issue 56570", () => {
  const questionDetails = {
    native: {
      query: `select '${"ab".repeat(200)}'`,
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    const card = await createNativeCard(mb.api, questionDetails);
    await visitQuestion(page, card.id);
  });

  test("should not push the toolbar off-screen (metabase#56570)", async ({
    page,
  }) => {
    await page.getByTestId("visibility-toggler").click();
    await expect(
      page.getByTestId("native-query-editor-action-buttons"),
    ).toBeVisible();
  });
});

test.describe("issue 53649", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not get caught in an infinite loop when opening the native editor (metabase#53649)", async ({
    page,
  }) => {
    await startNewNativeModel(page);

    // If the app freezes, this won't work
    await typeInNativeEditor(page, "select 1");
    await expect(nativeEditor(page)).toContainText("select 1");
  });
});

test.describe("issue 57441", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be possible to create a new snippet from the sidebar (metabase#57441)", async ({
    mb,
    page,
  }) => {
    await startNewNativeQuestion(page);

    await createSnippet(mb.api, { name: "snippet 1", content: "select 1" });

    await icon(
      page.getByTestId("native-query-editor-action-buttons"),
      "snippet",
    ).click();
    await icon(rightSidebar(page), "add").click();
    await popover(page).getByText("New snippet", { exact: true }).click();
    await expect(
      modal(page).getByText("Create your new snippet", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 56905", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await startNewNativeQuestion(page);
  });

  test("It should be possible to run the native query when a parameter value input is focused (metabase#56905)", async ({
    page,
  }) => {
    await typeInNativeEditor(page, "select {{ foo }}");

    // See issue 16584 above: the widget drops its placeholder on focus, so the
    // locator is resolved once, clicked, and then typed into via the keyboard
    // (which is exactly what cy.type() does).
    const fooInput = page.getByPlaceholder("Foo");
    await expect(fooInput).toBeVisible();
    await fooInput.click();
    await page.keyboard.type("foobar");

    // The point of the test: the shortcut must work while the param input has
    // focus, so do NOT move focus before pressing it.
    await page.keyboard.press("ControlOrMeta+Enter");

    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByText("foobar", { exact: true })
        .first(),
    ).toBeVisible();
  });
});

test.describe("issue 57644", () => {
  test.describe("with only one database", () => {
    test.beforeEach(async ({ mb, page }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await startNewNativeQuestionWithoutDatabase(page);
    });

    // ⚠️ RACY UPSTREAM — measured, see findings-inbox/native-reproductions.md.
    // With exactly one database the app AUTO-SELECTS it a short moment after
    // the editor mounts, so "Select a database" is a TRANSIENT state and this
    // first assertion is a race. Measured on the jar: 10/10 in isolation,
    // 1 failure in 6 whole-file runs, and deliberately inflatable to 3/12 by
    // inserting ~100ms of work before the assertion (two API probes). When it
    // fails, the top bar reads "Sample Database". Ruled out: a leaked
    // `last-used-native-database-id` user setting (undefined in every run) and
    // a stale second database (db count 1 in every run).
    // Kept verbatim rather than hardened: upstream asserts exactly this and any
    // tolerance for the auto-selected state would delete the check. The
    // SECOND assertion is the actual #57644 subject and is not racy.
    test("should not open the database picker when opening the native query editor when there is only one database (metabase#57644)", async ({
      page,
    }) => {
      await expect(
        page
          .getByTestId("native-query-top-bar")
          .getByText("Select a database", { exact: true }),
      ).toBeVisible();

      // The popover should not be visible, we give it a timeout here because the
      // popover disappears immediately and we don't want that to make the test pass.
      //
      // `{ timeout: 0 }` upstream — a deliberately NON-retrying, momentary
      // absence check (PORTING's one legitimate case for `count()`): a
      // retrying form would be satisfied the instant the wrongly-opened
      // popover closed itself, which is precisely the bug.
      expect(await page.getByRole("dialog").count()).toBe(0);
    });
  });

  test.describe("with multiple databases", () => {
    // Untagged upstream but restores postgres-12 and asserts "QA Postgres12".
    test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

    test.beforeEach(async ({ mb, page }) => {
      await mb.restore("postgres-12");
      await mb.signInAsAdmin();
      await startNewNativeQuestionWithoutDatabase(page);
    });

    test("should open the database picker when opening the native query editor and there are multiple databases (metabase#57644)", async ({
      page,
    }) => {
      const databasePicker = popover(page);
      await expect(databasePicker).toBeVisible();
      await expect(databasePicker).toContainText("Sample Database");
      await expect(databasePicker).toContainText("QA Postgres12");
    });
  });
});

test.describe("issue 51679", () => {
  const questionDetails = {
    native: {
      query: "SELECT {{var}}",
      "template-tags": {
        var: {
          id: "754ae827-661c-4fc9-b511-c0fb7b6bae2b",
          name: "var",
          type: "text",
          "display-name": "Var",
        },
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow to change the template tag type when the required field for a field filter is not set (metabase#51679)", async ({
    mb,
    page,
  }) => {
    const card = await createNativeCard(mb.api, questionDetails);
    await visitQuestion(page, card.id);

    await queryBuilderMain(page).getByTestId("visibility-toggler").click();
    await icon(queryBuilderMain(page), "variable").click();

    await rightSidebar(page).getByTestId("variable-type-select").click();
    await popover(page).getByText("Field Filter", { exact: true }).click();

    // without selecting the field, try to change the type again
    await rightSidebar(page).getByTestId("variable-type-select").click();
    await popover(page).getByText("Number", { exact: true }).click();
    await expect(
      rightSidebar(page).getByTestId("variable-type-select"),
    ).toHaveValue("Number");
  });
});

test.describe("issue 59110", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow dragging border to completely hide native query editor (metabase#59110)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    await expect(nativeEditor(page)).toBeVisible();
    await expect(
      page.getByTestId("visibility-toggler").getByText(/open editor/i),
    ).toHaveCount(0);

    const { height } = await clientRect(nativeEditor(page));
    const diff = height + 20;

    // drag the border to hide the editor
    const handle = page.getByTestId("drag-handle");
    const coordsDrag = await clientRect(handle);

    await triggerMouseEvent(handle, "mousedown", {
      clientX: coordsDrag.x,
      clientY: coordsDrag.y,
    });
    await triggerMouseEvent(handle, "mousemove", {
      clientX: coordsDrag.x,
      clientY: coordsDrag.y - diff,
    });

    await expect(nativeEditor(page)).toHaveCount(0);
    const openEditor = page
      .getByTestId("visibility-toggler")
      .getByText(/open editor/i);
    await expect(openEditor).toBeVisible();
    await openEditor.click();

    // verify that editor height is restored
    await expect(nativeEditor(page)).toBeVisible();
    const restored = await clientRect(nativeEditor(page));
    expect(restored.height).toBeGreaterThan(100);
  });
});

test.describe("issue 59356", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
  });

  test("should properly cancel the query via the keyboard shortcut (metabase#59356)", async ({
    page,
  }) => {
    // Port of `cy.get("@dataset.all").should("have.length", n)`: a passive
    // request counter (PORTING — three concurrent waitForResponses on one
    // predicate all resolve on the first hit).
    let datasetRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/dataset"
      ) {
        datasetRequests += 1;
      }
    });

    const getLoader = () =>
      queryBuilderMain(page).getByTestId("loading-indicator");
    const getEmptyStateMessage = () =>
      queryBuilderMain(page).getByText("Here's where your results will appear", {
        exact: true,
      });
    const typeRunShortcut = () => page.keyboard.press("ControlOrMeta+Enter");

    // open the native query
    await startNewNativeQuestion(page, {
      database: WRITABLE_DB_ID,
      query: "select pg_sleep(5000)",
    });

    // verify that the query is not running
    await expect(getLoader()).toHaveCount(0);
    await expect(getEmptyStateMessage()).toBeVisible();
    await expect.poll(() => datasetRequests).toBe(0);

    // run the query and verify that it is running
    await typeRunShortcut();
    await expect(getLoader()).toBeVisible();
    await expect(getEmptyStateMessage()).toHaveCount(0);
    await expect.poll(() => datasetRequests).toBe(1);

    // cancel the query and verify that no new query is running
    await typeRunShortcut();
    await expect(getLoader()).toHaveCount(0);
    await expect(getEmptyStateMessage()).toBeVisible();
    await expect.poll(() => datasetRequests).toBe(1);

    // run the query again and verify that it is running
    await typeRunShortcut();
    await expect(getLoader()).toBeVisible();
    await expect(getEmptyStateMessage()).toHaveCount(0);
    await expect.poll(() => datasetRequests).toBe(2);

    // cancel the query and verify that no new query is running
    await typeRunShortcut();
    await expect(getLoader()).toHaveCount(0);
    await expect(getEmptyStateMessage()).toBeVisible();
    await expect.poll(() => datasetRequests).toBe(2);
  });
});

test.describe("issue 63711", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("Completions should be visible when there are a lot of options (metabase#63711)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "s");

    // completions should be scrollable
    await expect(nativeEditorCompletions(page)).toBeVisible();
    const completionsList = nativeEditorCompletions(page).getByLabel(
      "Completions",
    );
    await expect(completionsList).toBeVisible();
    await expect
      .poll(async () =>
        completionsList.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      )
      .toBe(true);

    // completions should not cut off the height of the inner element
    const savepoint = nativeEditorCompletion(page, "SAVEPOINT").first();
    await expect(savepoint).toBeVisible();

    // Upstream's `findByText("AVEPOINT")` resolves to `.cm-completionLabel`
    // ITSELF: testing-library's getNodeText joins only DIRECT text-node
    // children, and CodeMirror wraps the matched prefix "S" in
    // `.cm-completionMatchedText`. Playwright's getByText compares full element
    // text, so it would match nothing — select the label element instead.
    const label = savepoint.locator(".cm-completionLabel");
    await expect(label).toBeVisible();
    const labelHeight = await label.evaluate(
      (element) => (element as HTMLElement).offsetHeight,
    );
    const rowHeight = await savepoint.evaluate(
      (element) => (element as HTMLElement).clientHeight,
    );
    expect(labelHeight).toBe(rowHeight);
  });
});

test.describe("issue 66745", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  for (const vizType of ["row", "bar"]) {
    test(`should not break visualization on native query column rename (metabase#63711) - ${vizType}`, async ({
      mb,
      page,
    }) => {
      // factories.createQuestion (not createNativeCard) — this is the one card
      // in the spec that needs `visualization_settings` in the POST, which
      // native-extras' createNativeCard hardcodes to `{}`.
      const card = await createQuestion(mb.api, {
        name: `66745 - ${vizType}`,
        native: {
          query:
            'SELECT \'Category 1\' AS CATEGORY_NAME, \'Category 2\' AS CATEGORY_NAME2, 100 AS "Total", 60 AS "Hello", 40 AS "World"',
        },
        display: vizType,
        visualization_settings: {
          "graph.dimensions": ["CATEGORY_NAME"],
          "graph.metrics": ["Total", "World"],
        },
      });
      await visitQuestion(page, card.id);

      const openEditor = queryBuilderMain(page).getByText("Open Editor", {
        exact: true,
      });
      await expect(openEditor).toBeVisible();
      await openEditor.click();

      // {backspace}2" — strips the closing quote off `40 AS "World"` and retypes
      // it as `40 AS "World2"`, i.e. renames the World column.
      await focusNativeEditor(page);
      await page.keyboard.press("Backspace");
      await page.keyboard.type('2"', { delay: 10 });

      const dataset = waitForDataset(page);
      await getRunQueryButton(page).click();
      await dataset;

      const vizRoot = page.getByTestId("query-visualization-root");
      await expect(vizRoot.getByText("Total", { exact: true })).toBeVisible();
      // Exact match, so "World2" does not satisfy it.
      await expect(vizRoot.getByText("World", { exact: true })).toHaveCount(0);

      const saveCard = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
      );
      await page
        .getByTestId("qb-header-action-panel")
        .getByText("Save", { exact: true })
        .click();
      await modal(page).getByText("Save", { exact: true }).click();
      await saveCard;

      await expect(
        page.getByTestId("qb-header-action-panel").getByText("Save", {
          exact: true,
        }),
      ).toHaveCount(0);

      await visitQuestion(page, card.id);

      await expect(
        page.getByText("Something’s gone wrong", { exact: true }),
      ).toHaveCount(0);

      const reloadedVizRoot = page.getByTestId("query-visualization-root");
      await expect(
        reloadedVizRoot.getByText("Total", { exact: true }),
      ).toBeVisible();
      await expect(
        reloadedVizRoot.getByText("World", { exact: true }),
      ).toHaveCount(0);

      await openVizSettingsSidebar(page);
      const fieldInputs = leftSidebar(page).getByPlaceholder("Select a field");
      await expect(fieldInputs).toHaveCount(2);
      await expect(fieldInputs.nth(1)).toHaveValue("Total");
    });
  }
});

test.describe("issue 51717", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should open question info sidebar when variables sidebar is already open (metabase#51717)", async ({
    mb,
    page,
  }) => {
    const card = await createNativeCard(mb.api, {
      name: "42",
      native: { query: "select 42" },
    });
    await visitQuestion(page, card.id);

    await page
      .getByTestId("visibility-toggler")
      .getByText(/open editor/i)
      .click();

    // Open variables sidebar
    const actionButtons = page.getByTestId("native-query-editor-action-buttons");
    await expect(actionButtons).toBeVisible();
    await actionButtons.getByLabel("Variables").click();
    await expect(rightSidebar(page)).toBeVisible();
    await expect(rightSidebar(page)).toContainText("Variables and parameters");

    // Info sidebar is opened
    await questionInfoButton(page).click();
    const infoSidebar = sidesheet(page);
    await expect(infoSidebar).toBeVisible();
    await expect(infoSidebar).toContainText("Info");

    // Make sure info sidebar is interactive (on top of the stack)
    await infoSidebar.getByRole("tab", { name: "History", exact: true }).click();
    await expect(infoSidebar).toContainText("You created this");
  });
});

test.describe("issue 59075", () => {
  const WINDOW_HEIGHT = 1000;

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    await startNewNativeQuestion(page);
    await page.setViewportSize({ width: 1024, height: WINDOW_HEIGHT });
  });

  test("should not be possible to resize the native query editor too far (metabase#59075)", async ({
    page,
  }) => {
    const handle = page.getByTestId("drag-handle");
    await expect(handle).toBeVisible();
    const coordsDrag = await clientRect(handle);

    await triggerMouseEvent(handle, "mousedown", {
      button: 0,
      clientX: coordsDrag.x,
      clientY: coordsDrag.y,
    });
    // Drag to the bottom of the screen
    await triggerMouseEvent(handle, "mousemove", {
      button: 0,
      clientX: coordsDrag.x,
      clientY: WINDOW_HEIGHT + 10,
    });
    await triggerMouseEvent(handle, "mouseup");

    await expect(nativeEditor(page)).toBeVisible();
    await expect
      .poll(async () => (await clientRect(nativeEditor(page))).bottom)
      .toBeLessThan(WINDOW_HEIGHT - 50);
  });
});

test.describe("issue 69160", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    await createSnippet(mb.api, {
      name: "A and B",
      content: "{{ a }} and {{ b }}",
    });
    await startNewNativeQuestion(page);
    await fastSetNativeEditor(page, "{{ snippet: A and B }}");
    await blurNativeEditor(page);
  });

  test("should be possible to reorder parameters when there are snippets in the query (metabase#69160)", async ({
    page,
  }) => {
    // reorder parameters
    const topBar = page.getByTestId("native-query-top-bar");
    const param = topBar.getByRole("listitem").first();
    await expect(param).toBeVisible();

    await triggerMouseEvent(param, "mousedown", { x: 5, y: 5 });
    await page.waitForTimeout(200);
    await triggerMouseEvent(param, "mousemove", { x: 20, y: 20 });
    await page.waitForTimeout(200);
    await triggerMouseEvent(param, "mousemove", { x: 200, y: 0 });
    await page.waitForTimeout(200);
    await triggerMouseEvent(param, "mouseup");
    await page.waitForTimeout(200);

    await expect(topBar.getByRole("textbox").first()).toHaveAttribute(
      "placeholder",
      "B",
    );
  });
});

// === local helpers ===

const POPOVER_ELEMENT =
  ".popover[data-state~='visible'],[data-element-id=mantine-popover]";

/** Register a wait for the next POST /api/dataset response. */
function waitForDataset(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

async function clickAway(page: import("@playwright/test").Page) {
  // cy.get("body").click(0, 0)
  await page.mouse.click(0, 0);
}
