/**
 * Playwright port of
 * e2e/test/scenarios/native-filters/native-filters-reproductions.cy.spec.js
 *
 * COLLISION CHECKS (both clean):
 * - The upstream directory holds exactly ONE `native-filters-reproductions.*`
 *   file (`.cy.spec.js`); there is no disjoint `.ts` sibling, and nothing
 *   matching under `e2e/test-component/`. The siblings there are
 *   native-filters-remapping.cy.spec.ts, sql-field-filter{,-types}.cy.spec.js,
 *   sql-filters{,-reset-clear,-source}.cy.spec.* — all separate specs.
 * - `tests/native-filters-reproductions.spec.ts` did not exist before this
 *   port. The landed `native-reproductions.spec.ts`, `filters-reproductions.spec.ts`
 *   and `sql-filters*.spec.ts` cover different sources and share no issue
 *   numbers with this file.
 * - Support module is `support/native-filters-reproductions.ts` — the default
 *   name, NO deviation.
 *
 * A reproductions file is many independent regression guards; describes are
 * kept 1:1 with upstream and nothing is merged.
 *
 * INFRA TIER: none. Every test runs against the H2 sample database on the bare
 * jar. See the issue-31606 note below for the one misleading tag.
 *
 * Porting notes
 * -------------
 * - `SQLFilter.enterParameterizedQuery(q)` is `NativeEditor.focus().type(q)` →
 *   `typeInNativeEditor`. CodeMirror auto-closes `{{`, and typing the closing
 *   braces overtypes them (the sql-filters / sql-filters-source precedent).
 * - `SQLFilter.runQuery()` waits on POST /api/dataset (the "@dataset" alias);
 *   the describe-level `cy.intercept("POST","/api/dataset").as("dataset")`
 *   calls are folded into that helper. Where the Cypress alias was
 *   `@cardQuery` the sql-filters-source `runQuery(page, "cardQuery")` variant
 *   is used instead.
 * - `@cardQuery` in the issue-12581 and issue-13961 describes is NOT
 *   spec-declared: `H.createNativeQuestion(…, { visitQuestion: true })` routes
 *   through `question()` in api/createQuestion.ts, whose default
 *   `interceptAlias` is literally `"cardQuery"` and which registers
 *   `POST /api/card/**​/:id/query`. Ported as a waitForResponse on that path.
 * - `cy.location("search").should("eq", …)` is a RETRIED assertion → expect.poll
 *   (`expectLocationSearch`), never a one-shot read of page.url().
 * - `H.moveDnDKitElementByAlias` maps to two different helpers depending on
 *   `useMouseEvents`: `true` → MouseSensor → `moveDnDKitElementSynthetic`;
 *   default/false → PointerSensor → `moveDnDKitPointer`. Both re-read the
 *   element's box, mirroring the Cypress helper's re-query-per-event.
 * - `cy.get(sel).should("contain", x)` (chai-jquery `contain`, i.e.
 *   `$el.is(":contains(x)")`) is an ANY-of-set assertion — NOT the
 *   `contain.text` concatenation case. Ported as "at least one match".
 * - Two describes are both titled "issue 31606" upstream. Playwright only
 *   rejects duplicate *full* titles, and the two test names differ, so the
 *   titles are kept verbatim.
 * - `describe("issue 17490")` upstream declares a `beforeEach` (a
 *   `/api/database?include=tables` mock) and NO `it` — it is dead code and has
 *   nothing to port. Recorded here rather than silently dropped.
 * - issue 13961 is `{ tags: "@skip" }` upstream, i.e. excluded from every CI
 *   run. Ported as `test.skip` (the sql-filters #19454 precedent), faithfully.
 * - issue 31606 ("should clear values on UI…") is tagged `@external` upstream,
 *   but it touches ONLY the H2 sample database — no QA container, no writable
 *   DB, no `WRITABLE_DB_ID`. (The tag is a leftover: the `WRITABLE_DB_ID`
 *   import was removed from this file in 4701e5f8dc5 without the tag being
 *   updated.) It is therefore NOT gated on PW_QA_DB_ENABLED and runs on the
 *   bare jar. Tags are unreliable in both directions — the spec was read.
 */
import { moveDnDKitElementSynthetic, moveDnDKitPointer } from "../support/dnd";
import { COLLECTION_GROUP } from "../support/admin-permissions";
import { filterWidget, sidebar } from "../support/dashboard";
import { updatePermissionsGraph } from "../support/dashboard-repros";
import {
  createNativeQuestion,
  createNativeQuestionAndDashboard,
} from "../support/factories";
import { editDashboardCard, findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { tableInteractive } from "../support/models";
import { clearNativeEditor } from "../support/native-extras";
import {
  chooseType,
  getRunQueryButton,
  mapFieldFilterTo,
  openTypePickerFromDefaultFilterType,
  removeFieldValuesValue,
  runQuery,
} from "../support/native-filters";
import {
  addDefaultStringFilter,
  expectLocationSearch,
  variableNameFields,
  variableNameLabels,
  visitQuestionUrlAwaitingCardQuery,
} from "../support/native-filters-reproductions";
import {
  nativeEditor,
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import { queryBuilderMain } from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { setWidgetType } from "../support/sql-filters-source";
import { setDefaultValue, setWidgetValue } from "../support/sql-filters";
import { icon, modal, popover, visitDashboard, visitQuestion } from "../support/ui";
import { getDashboardCard } from "../support/dashboard";
import { sidesheet } from "../support/revisions";
import { escapeRegExp } from "../support/text";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

test.describe("issue 9357", () => {
  // { viewportWidth: 800, viewportHeight: 600 }
  test.use({ viewport: { width: 800, height: 600 } });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should reorder template tags by drag and drop (metabase#9357)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "{{firstparameter}} {{nextparameter}} {{lastparameter}}",
    );

    // All three tags must exist before the drag — Cypress's command queue paced
    // the alias resolution past the tag-editor render; Playwright does not.
    await expect(filterWidget(page)).toHaveCount(3);

    // Drag the firstparameter to last position
    const dragElement = filterWidget(page).getByRole("listitem").first();
    // useMouseEvents: true → dnd-kit MouseSensor
    await moveDnDKitElementSynthetic(dragElement, { vertical: 50 });

    // Ensure they're in the right order
    const variableField = variableNameFields(page);

    await expect(
      variableField.first().getByText("nextparameter", { exact: true }),
    ).toBeAttached();

    await expect(
      variableField.nth(1).getByText("firstparameter", { exact: true }),
    ).toBeAttached();
  });
});

test.describe("issue 11480", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should clear a template tag's default value when the type changes (metabase#11480)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    // Parameter `x` defaults to a text parameter.
    await typeInNativeEditor(page, "select * from orders where total = {{x}}");

    // Mark field as required and add a default text value.
    await page.getByText("Always require a value", { exact: true }).click();
    await setDefaultValue(page, "some text");
    await expectLocationSearch(page, "?x=some%20text");

    // Run the query and see an error.
    await runQuery(page);
    // cy.contains(...) — case-sensitive substring, first match.
    await expect(
      page
        .getByText(
          new RegExp(escapeRegExp('Data conversion error converting "some text"')),
        )
        .first(),
    ).toBeAttached();

    // Oh wait! That doesn't match the total column, so we'll change the
    // parameter to a number.
    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Number");
    await expectLocationSearch(page, "?x=");

    // Although there's no default, we should be still able to run the query.
    await expect(getRunQueryButton(page)).toBeEnabled();
  });
});

test.describe("issue 11580", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shouldn't reorder template tags when updated (metabase#11580)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "{{foo}} {{bar}}");

    const variableLabels = variableNameLabels(page);

    async function assertVariablesOrder() {
      await expect(variableLabels.first()).toHaveText("foo");
      await expect(variableLabels.last()).toHaveText("bar");
    }

    // ensure they're in the right order to start
    await expect(variableLabels).toHaveCount(2);
    await assertVariablesOrder();

    // change the parameter to a number.
    const variableType = page.getByTestId("variable-type-select").first();
    await variableType.click();
    await chooseType(page, "Number");

    await expect(variableType).toHaveValue("Number");

    // ensure they're still in the right order
    await assertVariablesOrder();
  });
});

test.describe("issue 12581", () => {
  const ORIGINAL_QUERY = "SELECT * FROM ORDERS WHERE {{filter}} LIMIT 2";

  const filter = {
    id: "a3b95feb-b6d2-33b6-660b-bb656f59b1d7",
    name: "filter",
    "display-name": "Filter",
    type: "dimension",
    dimension: ["field", ORDERS.CREATED_AT, null],
    "widget-type": "date/month-year",
    default: null,
  };

  const nativeQuery = {
    name: "12581",
    native: {
      query: ORIGINAL_QUERY,
      "template-tags": {
        filter,
      },
    },
  };

  let cardId: number;

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createNativeQuestion(mb.api, nativeQuery);
    cardId = card.id;
    await visitQuestion(page, card.id);
  });

  test("should correctly display a revision state after a restore (metabase#12581)", async ({
    page,
  }) => {
    const cardQueryPath = new RegExp(`^/api/card/.*\\b${cardId}/query$`);
    const waitForCardQuery = () =>
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          cardQueryPath.test(new URL(response.url()).pathname),
      );

    // Start with the original version of the question made with API
    await page
      .getByTestId("visibility-toggler")
      .getByText(/open editor/i)
      .click();
    await expect(
      page.getByTestId("visibility-toggler").getByText(/open editor/i),
    ).toHaveCount(0);

    await clearNativeEditor(page);
    await typeInNativeEditor(page, "SELECT 1", { focus: false });

    await page.getByText("Save", { exact: true }).click();

    await page
      .getByTestId("save-question-modal")
      .getByText("Save", { exact: true })
      .click();

    const reloadQuery = waitForCardQuery();
    await page.reload();
    await reloadQuery;

    await page.getByTestId("revision-history-button").click();
    const sheet = sidesheet(page);
    await sheet.getByRole("tab", { name: "History", exact: true }).click();
    // Make sure sidebar opened and the history loaded
    await expect(sheet.getByText(/You created this/i).first()).toBeAttached();

    // Reverting reloads the question, which re-runs its query and resets the
    // info sidesheet to the Overview tab. Wait for that reload to settle before
    // re-reading the History tab, otherwise the tab switch races the reset.
    const revertQuery = waitForCardQuery();
    await sheet.getByTestId("question-revert-button").click(); // Revert to the first revision
    await revertQuery;

    await sheet.getByRole("tab", { name: "History", exact: true }).click();
    await expect(
      sheet.getByText(/You reverted to an earlier version/i).first(),
    ).toBeAttached();

    await page.getByLabel("Close", { exact: true }).click();

    await page
      .getByTestId("visibility-toggler")
      .getByText(/open editor/i)
      .click();

    // Reported failing on v0.35.3
    await expect(nativeEditor(page)).toBeVisible();
    await expect(nativeEditor(page)).toContainText(ORIGINAL_QUERY);

    await expect(
      tableInteractive(page).getByText("37.65", { exact: true }).first(),
    ).toBeAttached();

    // Filter dropdown field
    await expect(filterWidget(page).first()).toContainText("Filter");
  });
});

test.describe("issue 13961", () => {
  const categoryFilter = {
    id: "00315d5e-4a41-99da-1a41-e5254dacff9d",
    name: "category",
    "display-name": "Category",
    type: "dimension",
    default: "Doohickey",
    dimension: ["field", PRODUCTS.CATEGORY, null],
    "widget-type": "category",
  };

  const productIdFilter = {
    id: "4775bccc-e82a-4069-fc6b-2acc90aadb8b",
    name: "prodid",
    "display-name": "ProdId",
    type: "number",
    default: null,
  };

  const nativeQuery = {
    name: "13961",
    native: {
      query:
        "SELECT * FROM PRODUCTS WHERE 1=1 AND {{category}} [[AND ID={{prodid}}]]",
      "template-tags": {
        category: categoryFilter,
        prodid: productIdFilter,
      },
    },
  };

  // Upstream: describe("issue 13961", { tags: "@skip" }) — excluded from every
  // CI run. Ported as a declared skip, faithfully.
  test.skip("should clear default filter value in native questions (metabase#13961)", async ({
    mb,
    page,
  }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createNativeQuestion(mb.api, nativeQuery);
    await visitQuestion(page, card.id);

    const cardQueryPath = new RegExp(`^/api/card/.*\\b${card.id}/query$`);
    const waitForCardQuery = () =>
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          cardQueryPath.test(new URL(response.url()).pathname),
      );

    await expect(
      page.getByText("Small Marble Shoes", { exact: true }).first(),
    ).toBeAttached(); // Product ID 2, Doohickey

    await expectLocationSearch(page, "?category=Doohickey");

    // Remove default filter (category)
    await filterWidget(page).getByRole("button").click();

    const rerunQuestion = icon(page, "play").first();
    await expect(rerunQuestion).toBeVisible();
    let query = waitForCardQuery();
    await rerunQuestion.click();
    await query;

    await expect.poll(() => page.url()).not.toContain("?category=Doohickey");

    // Add value `1` to the ID filter
    await page
      .getByPlaceholder(productIdFilter["display-name"])
      .pressSequentially("1");

    query = waitForCardQuery();
    await rerunQuestion.click();
    await query;

    // Reported tested and failing on v0.34.3 through v0.37.3
    // URL is correct at this point, but there are no results
    await expectLocationSearch(page, `?${productIdFilter.name}=1`);
    await expect(
      page.getByText("Rustic Paper Wallet", { exact: true }).first(),
    ).toBeAttached(); // Product ID 1, Gizmo
  });
});

test.describe("issue 14302", () => {
  const priceFilter = {
    id: "39b51ccd-47a7-9df6-a1c5-371918352c79",
    name: "PRICE",
    "display-name": "Price",
    type: "number",
    default: "10",
    required: true,
  };

  const nativeQuery = {
    name: "14302",
    native: {
      query:
        'SELECT "CATEGORY", COUNT(*)\nFROM "PRODUCTS"\nWHERE "PRICE" > {{PRICE}}\nGROUP BY "CATEGORY"',
      "template-tags": {
        PRICE: priceFilter,
      },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createNativeQuestion(mb.api, nativeQuery);
    await visitQuestion(page, card.id);
  });

  test("should not make the question dirty when there are no changes (metabase#14302)", async ({
    page,
  }) => {
    // Reported on v0.37.5 - Regression since v0.37.0

    // ANCHOR (added, not upstream): the assertion below is a pure absence
    // check, and visitQuestion resolves on the query *response* — not on the
    // paint. Without an anchor that only exists in the loaded state it would
    // pass in the mount-lag window regardless of what the app does. The
    // parameter widget renders from the loaded card's template tags.
    await expect(filterWidget(page).first()).toBeVisible();

    await expect(page.getByText("Save", { exact: true })).toHaveCount(0);
  });
});

for (const variant of ["nodata+nosql", "nosql"] as const) {
  test.describe("issue 15163", () => {
    const nativeFilter = {
      id: "dd7f3e66-b659-7d1c-87b3-ab627317581c",
      name: "cat",
      "display-name": "Cat",
      type: "dimension",
      dimension: ["field-id", PRODUCTS.CATEGORY],
      "widget-type": "category",
      default: null,
    };

    const nativeQuery = {
      name: "15163",
      native: {
        query: 'SELECT COUNT(*) FROM "PRODUCTS" WHERE {{cat}}',
        "template-tags": {
          cat: nativeFilter,
        },
      },
    };

    const dashboardFilter = {
      name: "Category",
      slug: "category",
      id: "fd723065",
      type: "category",
    };

    const dashboardDetails = {
      parameters: [dashboardFilter],
    };

    test.beforeEach(async ({ mb, page }) => {
      await mb.restore();
      await mb.signInAsAdmin();

      const { id, card_id, dashboard_id } =
        await createNativeQuestionAndDashboard(mb.api, {
          questionDetails: nativeQuery,
          dashboardDetails,
        });

      // Connect filter to the dashboard card
      await mb.api.put(`/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 13,
            size_y: 8,
            series: [],
            visualization_settings: {
              "card.title": "New Title",
            },
            parameter_mappings: [
              {
                parameter_id: dashboardFilter.id,
                card_id,
                target: ["dimension", ["template-tag", "cat"]],
              },
            ],
          },
        ],
      });

      if (variant === "nosql") {
        await updatePermissionsGraph(mb.api, {
          [COLLECTION_GROUP]: {
            1: {
              "view-data": "unrestricted",
              "create-queries": "query-builder",
            },
          },
        });
      }

      await mb.signIn("nodata");

      // Visit dashboard and set the filter through URL
      await page.goto(`/dashboard/${dashboard_id}?category=Gizmo`);
    });

    test(`${variant.toUpperCase()} version:\n should be able to view SQL question when accessing via dashboard with filters connected to modified card without SQL permissions (metabase#15163)`, async ({
      page,
    }) => {
      const cardQuery = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /^\/api\/card\/.*\/query$/.test(new URL(response.url()).pathname),
        { timeout: 5000 },
      );

      await page.getByText("New Title", { exact: true }).click();

      const response = await cardQuery;
      const body = (await response.json()) as { error?: unknown };
      expect(body.error).toBeUndefined();

      // Upstream's `H.NativeEditor.get()` gates on the loading indicator being
      // gone before returning the locator (e2e-codemirror-helpers.ts:12) —
      // ported here because in a `should("not.exist")` it is the only anchor
      // the assertion has.
      await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
      //
      // ⚠️ VACUOUS UPSTREAM, ported verbatim (permissions surface — not
      // strengthened). `NativeEditor.get()` is byte-identically
      // `[data-testid=native-query-editor] .cm-content`, and a SAVED question
      // renders with the editor COLLAPSED for everyone: measured on this jar,
      // the count is 0 for the `nodata` user AND 0 for a full-permission admin
      // (mutation M15b: dropping the `signIn("nodata")` left this green). So it
      // cannot distinguish the has-SQL-permission case it exists to check. The
      // discriminating signal is the `visibility-toggler`, which measures 1 for
      // admin and 0 for nodata — but asserting on it would strengthen a
      // permissions assertion beyond the original, so it is left alone and
      // recorded in findings-inbox instead.
      await expect(nativeEditor(page)).toHaveCount(0);
      // chai-jquery `contain` on a multi-element subject is an ANY-of-set
      // assertion ($el.is(":contains(51)")), not a concatenation.
      await expect(
        page
          .getByTestId("cell-data")
          .filter({ hasText: new RegExp(escapeRegExp("51")) })
          .first(),
      ).toBeAttached();
      await expect(
        page.getByText("Showing 1 row", { exact: true }).first(),
      ).toBeAttached();
    });
  });
}

test.describe("issue 15700", () => {
  const widgetType = "String is not";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to select 'Field Filter' category in native query (metabase#15700)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "{{filter}}");

    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Field Filter");

    await mapFieldFilterTo(page, {
      table: "Products",
      field: "Category",
    });

    await setWidgetType(page, widgetType);
  });
});

test.describe("issue 15981", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await startNewNativeQuestion(page);
  });

  test('"Text" filter should work (metabase#15981-1)', async ({ page }) => {
    await typeInNativeEditor(
      page,
      "select * from PRODUCTS where CATEGORY = {{text_filter}}",
    );

    await setWidgetValue(page, "Gizmo");

    await runQuery(page);

    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByText(new RegExp(escapeRegExp("Rustic Paper Wallet")))
        .first(),
    ).toBeAttached();

    await icon(page, "contract").click();
    await expect(
      page.getByText("Showing 51 rows", { exact: true }).first(),
    ).toBeAttached();
    await expect(icon(page, "play")).toHaveCount(0);
  });

  test('"Number" filter should work (metabase#15981-2)', async ({ page }) => {
    await typeInNativeEditor(
      page,
      "select * from ORDERS where QUANTITY = {{number_filter}}",
    );

    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Number");

    await setWidgetValue(page, "20");

    await runQuery(page);

    await expect(
      page
        .getByTestId("query-visualization-root")
        .getByText(new RegExp(escapeRegExp("23.54")))
        .first(),
    ).toBeAttached();
  });
});

test.describe("issue 16739", () => {
  const filter = {
    id: "7795c137-a46c-3db9-1930-1d690c8dbc03",
    name: "filter",
    "display-name": "Filter",
    type: "dimension",
    dimension: ["field", PRODUCTS.CATEGORY, null],
    "widget-type": "string/=",
    default: null,
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  for (const user of ["normal", "nodata"] as const) {
    // Very related to the metabase#15981, only this time the issue happens with
    // the "Field Filter" without the value being set.
    test(`filter feature flag shouldn't cause run-overlay of results in native editor for ${user} user (metabase#16739)`, async ({
      mb,
      page,
    }) => {
      const card = await createNativeQuestion(mb.api, {
        native: {
          query: "select * from PRODUCTS where {{ filter }}",
          "template-tags": { filter },
        },
      });

      if (user === "nodata") {
        await mb.signOut();
        await mb.signIn(user);
      }

      await visitQuestion(page, card.id);

      await expect(icon(page, "play")).toHaveCount(0);
    });
  }
});

test.describe("issue 16756", () => {
  const questionDetails = {
    name: "16756",
    native: {
      query: "select * from PRODUCTS where {{filter}}",
      "template-tags": {
        filter: {
          id: "d3643bc3-a8f3-e015-8c83-d2ea50bfdf22",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", PRODUCTS.CREATED_AT, null],
          "widget-type": "date/range",
          default: null,
        },
      },
    },
  };

  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const card = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestionUrlAwaitingCardQuery(
      page,
      card.id,
      `/question/${card.id}?filter=2027-03-31~2028-03-31`,
    );
  });

  test("should allow switching between date filter types (metabase#16756)", async ({
    page,
  }) => {
    await page.getByText(/Open editor/i).click();
    await icon(page, "variable").click();

    // Update the filter widget type
    const widgetTypeSelect = await findByDisplayValue(
      page.getByTestId("sidebar-right"),
      "Date Range",
    );
    await widgetTypeSelect.click();

    await popover(page)
      .getByText(new RegExp(escapeRegExp("Single Date")))
      .first()
      .click();

    // The previous filter value should reset
    await expectLocationSearch(page, "?filter=");

    // Set the date to the 15th of October 2026
    // cy.clock(new Date("2026-10-31"), ["Date"]) fakes ONLY Date (timers keep
    // running) — Playwright's exact equivalent is clock.setFixedTime.
    await page.clock.setFixedTime(new Date("2026-10-31"));
    await filterWidget(page).click();

    await popover(page)
      .getByText(new RegExp(escapeRegExp("15")))
      .first()
      .click();

    await page.getByRole("button", { name: "Add filter", exact: true }).click();

    await runQuery(page);

    // We expect "No results"
    await expect(
      page.getByText("No results", { exact: true }).first(),
    ).toBeAttached();
  });
});

// Upstream `describe("issue 17490")` declares only a beforeEach (a
// /api/database?include=tables mock injecting 7 fake tables) and NO `it`.
// It is dead code — nothing to port.

test.describe("issue 27257", () => {
  test.beforeEach(async ({ mb, page }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "SELECT {{number}}");

    await expect(icon(filterWidget(page), "string")).toBeAttached();

    await page.getByTestId("variable-type-select").click();
    await popover(page)
      .getByText(new RegExp(escapeRegExp("Number")))
      .first()
      .click();

    const widget = filterWidget(page);
    await expect(icon(widget, "number")).toBeAttached();
    // The Cypress line is `findByPlaceholderText("Number").type("0").blur()`.
    // Native parameter widgets DROP their placeholder on focus, so the
    // placeholder locator cannot be re-resolved for the .blur() — assert the
    // placeholder exists, then hold the widget's input directly.
    await expect(widget.getByPlaceholder("Number")).toBeVisible();
    const input = widget.locator("input").first();
    await input.click();
    await page.keyboard.type("0");
    await input.blur();
    await expect(input).toHaveValue("0");

    await runQuery(page);

    await expect(page.getByTestId("scalar-value")).toHaveText("0");
  });

  test("should not drop numeric filter widget value on refresh even if it's zero (metabase#27257)", async ({
    page,
  }) => {
    await page.reload();
    await expect(
      page
        .getByText("Here's where your results will appear", { exact: true })
        .first(),
    ).toBeAttached();
    await findByDisplayValue(page.locator("body"), "0");
  });
});

test.describe("issue 31606", () => {
  const SQL_QUERY = "SELECT * FROM PRODUCTS WHERE CATEGORY = {{test}}";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should clear values on UI for Text, Number, Date and Field Filter Types (metabase#31606)", async ({
    page,
  }) => {
    const missingParams = () =>
      queryBuilderMain(page).getByText(/missing required parameters/);

    await startNewNativeQuestion(page);

    await typeInNativeEditor(page, SQL_QUERY);

    // Text
    await setWidgetValue(page, "Gizmo");
    await runQuery(page);

    await expect(missingParams()).toHaveCount(0);

    await filterWidget(page).getByRole("textbox").clear();

    await runQuery(page);
    await expect(missingParams().first()).toBeVisible();

    await expect(icon(filterWidget(page), "close")).toHaveCount(0);

    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Number");
    await setWidgetValue(page, "123");

    await runQuery(page);

    await expect(missingParams()).toHaveCount(0);

    await filterWidget(page).getByRole("textbox").clear();
    await runQuery(page);
    await expect(missingParams().first()).toBeVisible();

    await expect(icon(filterWidget(page), "close")).toHaveCount(0);

    // Field Filter - Default value
    // openTypePickerFromSelectedFilterType("Number") discards its argument —
    // it is the same "click the type select" call.
    await openTypePickerFromDefaultFilterType(page);
    await chooseType(page, "Field Filter");

    await mapFieldFilterTo(page, {
      table: "Products",
      field: "ID",
    });

    await expect(page.getByTestId("filter-widget-type-select")).toHaveValue(
      "ID",
    );
    await expect(page.getByTestId("filter-widget-type-select")).toBeDisabled();

    await addDefaultStringFilter(page, "2", "Add filter");

    const sidebarContent = page.getByTestId("sidebar-content");
    await expect(
      sidebarContent.getByText("Enter a default value…", { exact: true }),
    ).toHaveCount(0);
    await sidebarContent
      .getByText("Default filter widget value", { exact: true })
      .locator("xpath=following-sibling::*[1]")
      .locator("div")
      .first()
      .click();

    await removeFieldValuesValue(popover(page), 0);
    await popover(page).getByText("Update filter", { exact: true }).click();
    await expect(
      sidebarContent.getByText("Enter a default value…", { exact: true }),
    ).toBeVisible();

    // Field Filter
    await filterWidget(page).click();
    await popover(page).getByPlaceholder("Enter an ID").pressSequentially("23");
    await popover(page).getByText("Add filter", { exact: true }).click();

    await expect(
      icon(filterWidget(page), "close").filter({ visible: true }).first(),
    ).toBeVisible();

    await runQuery(page);
    await expect(missingParams()).toHaveCount(0);

    await filterWidget(page).click();

    await removeFieldValuesValue(popover(page), 0);
    await popover(page).getByText("Update filter", { exact: true }).click();

    await expect(icon(filterWidget(page), "close")).toHaveCount(0);
  });
});

test.describe("issue 34129", () => {
  const parameter = {
    name: "Relative Date",
    slug: "relative_date",
    id: "3952592",
    type: "date/relative",
    sectionId: "date",
  };

  const templateTag = {
    type: "dimension",
    name: "time",
    id: "301a329f-5a83-40df-898b-236078025cbe",
    "display-name": "Time",
    dimension: ["field", ORDERS.CREATED_AT, null],
    "widget-type": "date/month-year",
  };

  const questionDetails = {
    name: "issue 34129",
    native: {
      query:
        "select min(CREATED_AT), max(CREATED_AT), count(*) from ORDERS where {{ time }}",
      "template-tags": {
        [templateTag.name]: templateTag,
      },
    },
  };

  const dashboardDetails = {
    parameters: [parameter],
  };

  const getParameterMapping = (cardId: number, parameterId: string) => ({
    card_id: cardId,
    parameter_id: parameterId,
    target: ["dimension", ["template-tag", templateTag.name]],
  });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should support mismatching date filter parameter values when navigating from a dashboard (metabase#34129)", async ({
    mb,
    page,
  }) => {
    const card = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    const { card_id, dashboard_id } = card;
    const mapping = getParameterMapping(card_id, parameter.id);
    await editDashboardCard(mb.api, card, { parameter_mappings: [mapping] });
    // visitDashboard already awaits every first-tab dashcard query, so the
    // upstream `cy.wait("@dashcardQuery")` that follows it is folded in.
    await visitDashboard(page, mb.api, dashboard_id);

    const dashcardQuery = page.waitForResponse((response) =>
      /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
        new URL(response.url()).pathname,
      ),
    );
    await filterWidget(page).click();
    await popover(page).getByText("Today", { exact: true }).click();
    await dashcardQuery;

    const cardQuery = page.waitForResponse((response) =>
      /^\/api\/card\/.*\/query$/.test(new URL(response.url()).pathname),
    );
    await getDashboardCard(page)
      .getByText(questionDetails.name, { exact: true })
      .click();
    await cardQuery;

    await expect(
      filterWidget(page).getByText("Today", { exact: true }).first(),
    ).toBeAttached();
  });
});

test.describe("issue 31606", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not start drag and drop from clicks on popovers", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    await typeInNativeEditor(page, "{{foo}} {{bar}}");

    await expect(filterWidget(page)).toHaveCount(2);

    await page.getByRole("radio", { name: "Search box" }).first().click();
    await filterWidget(page).first().click();

    const dragElement = popover(page).getByText("Add filter", { exact: true });
    // No useMouseEvents → dnd-kit PointerSensor.
    //
    // ⚠️ VACUOUS UPSTREAM, ported verbatim. `ParametersList` builds its
    // sensors with `useDndSensors` (common/hooks/use-dnd-sensors.ts), which
    // registers **MouseSensor + TouchSensor only — no PointerSensor**. A
    // pointer-event drag therefore cannot activate this list's dnd-kit for ANY
    // target, so "the widgets did not reorder" is guaranteed regardless of the
    // popover-click behaviour under test. Measured both directions:
    //  - M11: driving the same PointerEvents at the FIRST WIDGET (a target that
    //    demonstrably reorders under mouse events — see issue 9357, which
    //    passes `useMouseEvents: true`) also fails to reorder → the drag is
    //    inert, not merely refused.
    //  - M11b: re-running THIS drag with MouseEvents (the sensor actually in
    //    use) still does not reorder → the app's fix is real; the test as
    //    written just cannot observe it.
    // Left as-is because Cypress has identical semantics (same event
    // constructors), so this is upstream vacuity, not port drift.
    await moveDnDKitPointer(dragElement, { horizontal: 300 });

    await expect(filterWidget(page)).toHaveCount(2);
    await expect(filterWidget(page).first()).toContainText("Foo");
  });
});

test.describe("issue 49577", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not show the values initially when using a single select search box (metabase#49577)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select * from {{param");

    const tagSidebar = sidebar(page).last();
    await tagSidebar.getByText("Search box", { exact: true }).click();
    await tagSidebar.getByText("Edit", { exact: true }).click();

    const dialog = modal(page);
    await dialog.getByText("Custom list", { exact: true }).click();
    await dialog.getByRole("textbox").fill("foo\nbar\nbaz");
    await dialog.getByRole("button", { name: "Done", exact: true }).click();

    await filterWidget(page).click();

    const searchPopover = popover(page);
    await expect(
      searchPopover.getByText("foo", { exact: true }),
    ).toHaveCount(0);
    await expect(
      searchPopover.getByText("bar", { exact: true }),
    ).toHaveCount(0);
    await expect(
      searchPopover.getByText("baz", { exact: true }),
    ).toHaveCount(0);

    const searchInput = searchPopover.getByPlaceholder("Search");
    await expect(searchInput).toBeVisible();
    await searchInput.pressSequentially("fo");

    await expect(searchPopover.getByText("foo", { exact: true })).toBeVisible();

    await sidebar(page)
      .last()
      .getByText("Dropdown list", { exact: true })
      .click();

    await filterWidget(page).click();

    const listPopover = popover(page);
    await expect(listPopover.getByPlaceholder("Search the list")).toBeVisible();
    await expect(listPopover.getByText("foo", { exact: true })).toBeVisible();
    await expect(listPopover.getByText("bar", { exact: true })).toBeVisible();
    await expect(listPopover.getByText("baz", { exact: true })).toBeVisible();
  });
});

test.describe("issue 70311", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show the run overlay for a saved question with an empty between field filter (metabase#70311)", async ({
    mb,
    page,
  }) => {
    const card = await createNativeQuestion(mb.api, {
      name: "70311",
      native: {
        query: "SELECT * FROM PRODUCTS WHERE {{filter}} LIMIT 5",
        "template-tags": {
          filter: {
            id: "a3b95feb-b6d2-33b6-660b-bb656f59b1d7",
            name: "filter",
            "display-name": "Filter",
            type: "dimension",
            dimension: ["field", PRODUCTS.RATING, null],
            "widget-type": "number/between",
            default: null,
          },
        },
      },
    });

    // visitQuestion waits on the card query (the "@cardQuery" alias).
    await visitQuestion(page, card.id);

    await expect(page.getByTestId("query-visualization-root")).toBeVisible();
    await expect(icon(page, "play")).toHaveCount(0);
  });
});
