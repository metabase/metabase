/**
 * Playwright port of e2e/test/scenarios/native/native.cy.spec.js
 *
 * COLLISION CHECKS (PORTING "two upstream specs can share a basename"):
 * - `e2e/test/scenarios/native/` contains a disjoint `.js`/`.ts` pair —
 *   `native-reproductions.cy.spec.js` and `native-reproductions.cy.spec.ts`.
 *   MY source, `native.cy.spec.js`, has NO same-basename `.ts` sibling
 *   (`ls` of the directory: native-database-source.cy.spec.ts,
 *   native-reproductions.cy.spec.{js,ts}, native.cy.spec.js,
 *   native_subquery.cy.spec.js, snippet-tags.cy.spec.ts, snippets.cy.spec.js,
 *   suggestions.cy.spec.ts, table-tags.cy.spec.ts). `e2e/test-component/`
 *   holds only `scenarios/embedding-sdk`, no `native*` basename.
 * - `tests/native.spec.ts` did not exist before this port; the landed native
 *   siblings are native-reproductions{,-js}, native-subquery,
 *   native-snippet-tags, native-query-drill, native-table-tags,
 *   native-sql-generation, native-filters-reproductions, native-suggestions,
 *   native-filters-remapping, embedding-native. None of them ports this file.
 * - Support module is `support/native.ts` (no shared module was edited; the
 *   name matches this spec's basename, so nothing to flag).
 *
 * INFRA TIER: essentially container-free.
 * - `scenarios > question > native` restores the DEFAULT snapshot. 19 of its
 *   21 tests need no container at all.
 * - Two tests carry `{ tags: "@mongo" }` and call `H.restore("mongo-5")`
 *   ("should use the correct indentation for mongo", "it should insert a two
 *   spaces when pressing tab in json-like languages"). The tagging is
 *   CORRECT — no other test in the file touches a container, and neither of
 *   these two is untagged. They are gated on PW_QA_DB_ENABLED.
 * - `no native access` is `{ tags: ["@external", "@skip"] }`, i.e. excluded
 *   upstream. Ported as `test.describe.skip`. Its `WRITABLE_DB_ID` references
 *   are the documented RED HERRING: it restores `postgres-12`, under which
 *   database 2 is the READ-ONLY "QA Postgres12" sample — not the writable
 *   container. So #85 (writable-container debris) does not apply to this
 *   spec at all, and nothing here pins a schema or lists tables.
 * - `scenarios > native question > data reference sidebar` restores the
 *   default snapshot. No containers.
 *
 * PORTING NOTES
 * - The spec-local `runQuery()` clicks the labelled "Get Answer" button, NOT
 *   the `play` icon that H.runNativeQuery uses. Both appear in this file
 *   (`H.runNativeQuery()` in the time-grouping tests) and they are kept
 *   distinct: `runQuery` (support/native.ts) vs the shared `runNativeQuery`.
 * - `H.NativeEditor.type()` is not a literal typist. It splits the string on
 *   `{…}` escapes and replays them as key presses, after first rewriting
 *   `{{` to `{{}{{}` (two literal `{` presses). For plain text that is
 *   byte-identical to `page.keyboard.type`, so `{{Stars}}` &c. are typed
 *   verbatim. The escapes that appear here are expanded explicitly:
 *   `{movetoend}`→End, `{selectall}`→Mod+A, `{tab}`→Tab, `{enter}`→Enter.
 *   The mongo string `"[{enter}{ {enter}\"foo\"…"` is subtler: the regex
 *   `/(\{[^}]+\})/` swallows `{ {enter}` as ONE unknown escape, which the
 *   helper types as `{` followed by `realType(" {enter}")` — and
 *   cypress-real-events' realType parses `{enter}` as a key. Net sequence:
 *   `[`, Enter, `{`, SPACE, Enter, `"foo": "bar",`, Enter, `"baz"`. The
 *   space is load-bearing and easy to lose; it is reproduced verbatim.
 * - `should("have.text", …)` on CodeMirror compares raw `textContent`;
 *   Playwright's `toHaveText` normalizes whitespace and would silently pass
 *   "\tSELECT" as "SELECT". Those assertions go through
 *   `expectEditorTextContent`/`expectLineTextContent` (support/native.ts).
 * - Native parameter widgets drop their `placeholder` on focus, so every
 *   `cy.get("input[placeholder*=…]").type(…)` is ported as resolve-once +
 *   click + `keyboard.type` (`clickAndType`), never a re-resolving `fill()`.
 * - `cy.wait("@card")` / `cy.wait("@cardQuestion")` are ported as
 *   `waitForResponse` registered BEFORE the click/navigation that triggers
 *   them. None of them is a retroactive queue pop: every alias in this file
 *   is awaited exactly once and the triggering action is unambiguous.
 * - `cy.contains(x)` is a case-sensitive substring over the first DOM hit →
 *   `getByText(/x/).first()`.
 * - Two ADDED anchors, both anti-vacuity and both called out explicitly:
 *   (1) "should not show metrics when they are not defined on the selected
 *   table" — upstream asserts `findByText(/metric/).should("not.exist")`
 *   immediately after clicking ORDERS, which is satisfied by "the table
 *   detail has not rendered yet". The port first anchors on the loaded-state
 *   "9 columns" before asserting absence. (2) the `visibility-toggler`
 *   round-trip in the two-sidebars test anchors on the sidebar being visible
 *   before asserting it is hidden.
 * - `should("not.be.visible")` on `sidebar-right`: ported with
 *   `expectCypressHidden` (support/question-reproductions-4.ts), which
 *   reproduces chai-jquery's zero-box/display/visibility/opacity semantics.
 *   The occlusion branch of that rule (fixed/sticky elements) does not apply
 *   here — measured: the collapsed sidebar has a zero-width box.
 * - "should be possible to format the native query using the keyboard
 *   shortcut" repeats `H.restore()` + `cy.signInAsNormalUser()` inside the
 *   test even though the `beforeEach` already did both. Ported verbatim
 *   (faithfulness) rather than dropped as a redundant ~10s restore.
 */
import { test, expect } from "../support/fixtures";
import { ALL_USERS_GROUP } from "../support/admin-datamodel";
import { NOSQL_GROUP } from "../support/admin-permissions";
import { openVizSettingsSidebar } from "../support/charts";
import { updateCollectionGraph } from "../support/click-behavior";
import { cachedUserName } from "../support/dashboard-core";
import { updatePermissionsGraph } from "../support/dashboard-repros";
import { createNativeQuestion, createQuestion } from "../support/factories";
import {
  MONGO_SKIP_REASON,
  clickAndType,
  dataReferenceSidebar,
  expectEditorTextContent,
  expectLineTextContent,
  nativeEditorValue,
  pressRepeatedly,
  runQuery,
  setViewport,
  sidebarHeaderTitle,
  waitForCardGet,
  waitForCardPost,
  waitForDataset,
  waitForDatasetNative,
} from "../support/native";
import {
  focusNativeEditor,
  nativeEditor,
  startNewNativeQuestion,
  typeInNativeEditor,
} from "../support/native-editor";
import { filterWidgetByName } from "../support/native-filters-extras";
import {
  openQuestionActions,
  runNativeQuery,
  visitModel,
} from "../support/models";
import { entityPickerModal, pickEntity } from "../support/entity-picker";
import { visitQuestionAdhoc } from "../support/permissions";
import { expectCypressHidden } from "../support/question-reproductions-4";
import { visitCollection } from "../support/question-new";
import { rightSidebar } from "../support/question-saved";
import {
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
  THIRD_COLLECTION_ID,
} from "../support/sample-data";
import { codeMirrorValue } from "../support/snippets";
import {
  icon,
  modal,
  popover,
  queryBuilderHeader,
  visitQuestion,
} from "../support/ui";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric" as const,
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

test.describe("scenarios > question > native", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("lets you create and run a SQL question", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select count(*) from orders");

    await runQuery(page);
    await expect(page.getByText(/18,760/).first()).toBeVisible();
  });

  test("should suggest the currently viewed collection when saving question if the user has not recently visited a dashboard", async ({
    page,
  }) => {
    await visitCollection(page, THIRD_COLLECTION_ID);
    await startNewNativeQuestion(page, { collection_id: THIRD_COLLECTION_ID });

    await typeInNativeEditor(page, "select count(*) from orders");

    await queryBuilderHeader(page).getByText("Save", { exact: true }).click();

    const saveModal = page.getByTestId("save-question-modal");
    const saveTarget = saveModal.getByLabel(/Where do you want to save this/);
    await expect(saveTarget).toHaveText("Third collection");
    // cy.log("after selecting a dashboard, it should be the new suggestion")
    await saveTarget.click();

    await entityPickerModal(page)
      .getByText("Orders in a dashboard", { exact: true })
      .click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Select this dashboard", exact: true })
      .click();

    await expect(
      page
        .getByTestId("save-question-modal")
        .getByLabel(/Where do you want to save this/),
    ).toHaveText("Orders in a dashboard");

    await page.goto("/");

    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select count(*) from orders");

    await queryBuilderHeader(page).getByText("Save", { exact: true }).click();

    const saveModal2 = page.getByTestId("save-question-modal");
    await expect(
      saveModal2.getByLabel(/Where do you want to save this/),
    ).toHaveText("Orders in a dashboard");

    await saveModal2.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  test("displays an error", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select * from not_a_table");

    await runQuery(page);
    await expect(
      page.getByText(/Table "NOT_A_TABLE" not found/).first(),
    ).toBeVisible();
  });

  test("displays an error when running selected text", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select * from orders");

    // move left three
    await pressRepeatedly(page, "ArrowLeft", 3);
    // highlight back to the front
    await pressRepeatedly(page, "Shift+ArrowLeft", 19);
    await runQuery(page);
    await expect(page.getByText(/Table "ORD" not found/).first()).toBeVisible();
  });

  test.describe("template tags", () => {
    test("should handle template tags", async ({ page }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "select * from PRODUCTS where RATING > {{Stars}}",
      );

      await clickAndType(page.locator("input[placeholder*='Stars']"), "3");
      await runQuery(page);
      await expect(page.getByText(/Showing 168 rows/).first()).toBeVisible();
    });

    test("should modify parameters accordingly when tags are modified", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "select * from PRODUCTS where CATEGORY = {{cat}}",
      );

      await rightSidebar(page)
        .getByText("Always require a value", { exact: true })
        .click();
      await clickAndType(
        page.locator("input[placeholder*='Enter a default value']"),
        "Gizmo",
      );
      await runQuery(page);

      await page.getByText("Save", { exact: true }).first().click();

      const saveModal = page.getByTestId("save-question-modal");
      await clickAndType(
        saveModal.getByLabel("Name", { exact: true }),
        "Products on Category",
      );

      const cardPost = waitForCardPost(page);
      await saveModal.getByText("Save", { exact: true }).click();

      const requestBody = (await cardPost).request().postDataJSON() as {
        parameters?: { default?: unknown }[];
      };
      expect(requestBody?.parameters?.length).toBe(1);
      const parameter = requestBody.parameters![0];
      expect(parameter.default).toBe("Gizmo");
    });

    test("should recognize template tags and save them as parameters", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await typeInNativeEditor(
        page,
        "select * from PRODUCTS where CATEGORY={{cat}} and RATING >= {{stars}}",
      );
      await clickAndType(page.locator("input[placeholder*='Cat']"), "Gizmo");
      await clickAndType(page.locator("input[placeholder*='Stars']"), "3");

      await runQuery(page);

      await page.getByText("Save", { exact: true }).first().click();

      const saveModal = page.getByTestId("save-question-modal");
      await clickAndType(
        saveModal.getByLabel("Name", { exact: true }),
        "SQL Products",
      );

      const cardPost = waitForCardPost(page);
      await saveModal.getByText("Save", { exact: true }).click();
      const cardResponse = await cardPost;

      // parameters[] should reflect the template tags
      const requestBody = cardResponse.request().postDataJSON() as {
        parameters?: unknown[];
      };
      expect(requestBody?.parameters?.length).toBe(2);
      const questionId = ((await cardResponse.json()) as { id: number }).id;

      // Now load the question again and parameters[] should still be there
      const cardQuestion = waitForCardGet(page, questionId);
      await page.goto(`/question/${questionId}?cat=Gizmo&stars=3`);
      const responseBody = (await (await cardQuestion).json()) as {
        parameters?: unknown[];
      };
      expect(responseBody?.parameters?.length).toBe(2);
    });

    test.describe("time grouping", () => {
      async function setVariableType(page: import("@playwright/test").Page) {
        await rightSidebar(page).getByTestId("variable-type-select").click();
        await popover(page).getByText("Time grouping", { exact: true }).click();
      }

      async function setVariableTypeAndField(
        page: import("@playwright/test").Page,
      ) {
        await setVariableType(page);
        await popover(page).getByText("Orders", { exact: true }).click();
        await popover(page).getByText("Created At", { exact: true }).click();
      }

      test("should create entries in variables sidebar", async ({ page }) => {
        await startNewNativeQuestion(page);
        await typeInNativeEditor(
          page,
          "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
        );
        await setVariableTypeAndField(page);
        const label = rightSidebar(page).getByLabel("Parameter widget label", {
          exact: true,
        });
        await clickAndType(label, " updated");
        await label.blur();
        await expect(
          filterWidgetByName(page, "Unit updated").first(),
        ).toBeAttached();
      });

      test("should handle required prop for time grouping", async ({
        page,
      }) => {
        await startNewNativeQuestion(page);
        await typeInNativeEditor(
          page,
          "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
        );
        await setVariableTypeAndField(page);
        await rightSidebar(page)
          .getByLabel("Always require a value", { exact: true })
          .locator("..")
          .click();
        await runNativeQuery(page);
        await expect(page.getByTestId("query-visualization-root")).toContainText(
          "You'll need to pick a value for 'Unit' before this query can run.",
        );

        await rightSidebar(page)
          .getByText("Enter a default value…", { exact: true })
          .click();
        await popover(page).getByText("Year", { exact: true }).click();
        await runNativeQuery(page);
        await expect(page.getByTestId("query-visualization-root")).toContainText(
          "January 1, 2025",
        );
      });

      test("should reset default value when time grouping options are changed", async ({
        mb,
        page,
      }) => {
        const questionWithDefaultValue = {
          name: "Saved question with time grouping",
          native: {
            query:
              "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
            "template-tags": {
              unit: {
                type: "temporal-unit",
                name: "unit",
                id: "eb345703-001c-4b2a-b7d5-71cb3efe4beb",
                "display-name": "Unit",
                dimension: ["field", ORDERS.CREATED_AT, null],
                required: true,
                default: "year",
              },
            },
          },
        };

        const { id } = await createNativeQuestion(
          mb.api,
          questionWithDefaultValue,
        );
        await visitQuestion(page, id);

        // cy.log("open editor")
        await page.getByTestId("visibility-toggler").click();
        await icon(
          page.getByTestId("native-query-editor-container"),
          "variable",
        ).click();

        await expect(rightSidebar(page)).toContainText(
          "Variables and parameters",
        );

        await expect(
          rightSidebar(page)
            .getByText("Default parameter widget value", { exact: true })
            .locator("xpath=following-sibling::*[1]"),
        ).toContainText("Year");
        await rightSidebar(page)
          .getByText("Time grouping options", { exact: true })
          .locator("xpath=following-sibling::*[1]")
          .click();
        await popover(page).getByText("Year", { exact: true }).click();

        // cy.log("verify default value is empty")
        await expect(rightSidebar(page)).toContainText(
          "Enter a default value…",
        );
      });

      test("should show validation error when query is invalid", async ({
        page,
      }) => {
        await startNewNativeQuestion(page);
        await typeInNativeEditor(
          page,
          "SELECT count(*), {{unit}} as unit FROM ORDERS GROUP BY unit",
        );
        await setVariableType(page);
        // `should("have.attr", "data-disabled")` with no value is a PRESENCE
        // assertion (one-arg toHaveAttribute), not a value comparison.
        await expect(
          queryBuilderHeader(page).getByRole("button", {
            name: "Save",
            exact: true,
          }),
        ).toHaveAttribute("data-disabled");
      });
    });
  });

  test("can save a question with no rows", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(page, "select * from people where false");
    await runQuery(page);
    await expect(page.getByText(/No results/).first()).toBeVisible();
    await icon(page, "contract").click();
    await page.getByText("Save", { exact: true }).first().click();

    const saveModal = page.getByTestId("save-question-modal");
    await clickAndType(
      saveModal.getByLabel("Name", { exact: true }),
      "empty question",
    );
    await saveModal.getByText("Save", { exact: true }).click();

    // confirm that the question saved and url updated
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/\/question\/\d+/);
  });

  test("should be able to add new columns after hiding some (metabase#15393)", async ({
    page,
  }) => {
    await startNewNativeQuestion(page, { display: "table" });
    await typeInNativeEditor(page, "select 1 as visible, 2 as hidden");
    const runQueryIcon = icon(
      page.getByTestId("native-query-editor-container"),
      "play",
    );
    await runQueryIcon.click();

    await openVizSettingsSidebar(page);
    const sidebar = page.getByTestId("sidebar-left");
    await icon(sidebar.getByTestId("draggable-item-HIDDEN"), "eye_outline")
      // Cypress {force: true} DISPATCHES at the resolved element; Playwright's
      // force-click moves the real mouse. dispatchEvent is the faithful port.
      .dispatchEvent("click");
    await typeInNativeEditor(page, ", 3 as added");
    await icon(
      page.getByTestId("native-query-editor-container"),
      "play",
    ).click();
    await expect(sidebar.getByText(/added/i).first()).toBeVisible();
  });

  test("should not autorun ad-hoc native queries by default", async ({
    page,
  }) => {
    await visitQuestionAdhoc(
      page,
      {
        display: "scalar",
        dataset_query: {
          type: "native",
          native: {
            query: "SELECT 1",
          },
          database: SAMPLE_DB_ID,
        },
      },
      { autorun: false },
    );

    await expect(
      page.getByText("Here's where your results will appear", { exact: true }),
    ).toBeVisible();
  });

  test("should allow to preview a fully parameterized query", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "select * from PRODUCTS where CATEGORY={{category}}",
    );
    await clickAndType(page.getByPlaceholder("Category", { exact: true }), "Gadget");
    const datasetNative = waitForDatasetNative(page);
    await page
      .getByRole("button", { name: "Preview the query", exact: true })
      .click();
    await datasetNative;

    await expect
      .poll(() => codeMirrorValue(modal(page)))
      .toContain("CATEGORY = 'Gadget'");
  });

  test("should show errors when previewing a query", async ({ page }) => {
    await startNewNativeQuestion(page);
    await typeInNativeEditor(
      page,
      "select * from PRODUCTS where CATEGORY={{category}}",
    );
    const datasetNative = waitForDatasetNative(page);
    await page
      .getByRole("button", { name: "Preview the query", exact: true })
      .click();
    await datasetNative;

    await expect(
      modal(page).getByText(/missing required parameters/),
    ).toBeVisible();
  });

  test("should run the query when pressing meta+enter", async ({ page }) => {
    await startNewNativeQuestion(page, {
      query: "SELECT COUNT(*) FROM ORDERS",
    });
    await focusNativeEditor(page);

    const dataset = waitForDataset(page);
    await page.keyboard.press("ControlOrMeta+Enter");
    await dataset;

    await expect(page.getByTestId("query-visualization-root")).toContainText(
      "18,760",
    );

    // make sure a new line was not inserted
    const lineNumbers = page.locator(".cm-lineNumbers");
    await expect(lineNumbers).toContainText("1");
    await expect(lineNumbers).not.toContainText("2");
  });

  test("should be possible to format the native query using the keyboard shortcut", async ({
    mb,
    page,
  }) => {
    // Upstream repeats the beforeEach setup inside the test; kept verbatim.
    await mb.restore();
    await mb.signInAsNormalUser();
    await startNewNativeQuestion(page, {
      query: "SELECT COUNT(*) FROM ORDERS",
    });
    await focusNativeEditor(page);

    await page.keyboard.press("ControlOrMeta+Shift+f");

    await expect
      .poll(() => nativeEditorValue(page))
      .toContain("SELECT\n  COUNT(*)\nFROM\n  ORDERS");
  });

  test("should add tab at the end of the query", async ({ page }) => {
    await startNewNativeQuestion(page, {
      query: "SELECT",
    });

    await focusNativeEditor(page);
    await page.keyboard.press("Tab");

    await expectEditorTextContent(nativeEditor(page), "SELECT\t");
  });

  test("should indent the line when pressing tab while selected", async ({
    page,
  }) => {
    await startNewNativeQuestion(page, {
      query: "SELECT",
    });
    // H.NativeEditor.focus().type("{selectall}") — type() re-focuses, then
    // selectAll() is focus + Mod+A.
    await focusNativeEditor(page);
    await focusNativeEditor(page);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Tab");

    await expectEditorTextContent(nativeEditor(page), "\tSELECT");
  });

  test("should indent the next line to the same level when entering newline", async ({
    page,
  }) => {
    await startNewNativeQuestion(page);

    await focusNativeEditor(page);
    // "{tab}SELECT{enter}FOO" — type() re-focuses first (focus defaults true).
    await focusNativeEditor(page);
    await page.keyboard.press("Tab");
    await page.keyboard.type("SELECT", { delay: 10 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("FOO", { delay: 10 });

    await expectEditorTextContent(nativeEditor(page), "\tSELECT\tFOO");
  });

  test.describe("mongo", { tag: ["@external", "@mongo"] }, () => {
    test.skip(!process.env.PW_QA_DB_ENABLED, MONGO_SKIP_REASON);

    test("should use the correct indentation for mongo", async ({
      mb,
      page,
    }) => {
      const MONGO_DB_NAME = "QA Mongo";

      await mb.restore("mongo-5");
      await mb.signInAsAdmin();

      await startNewNativeQuestion(page);
      await page.getByTestId("gui-builder-data").click();
      await page.getByLabel(MONGO_DB_NAME, { exact: true }).click();

      // '[{enter}{ {enter}"foo": "bar",{enter}"baz"' expands to:
      //   [ , Enter, { , SPACE, Enter, "foo": "bar", , Enter, "baz"
      await focusNativeEditor(page);
      await page.keyboard.type("[", { delay: 10 });
      await page.keyboard.press("Enter");
      await page.keyboard.type("{", { delay: 10 });
      await page.keyboard.type(" ", { delay: 10 });
      await page.keyboard.press("Enter");
      await page.keyboard.type('"foo": "bar",', { delay: 10 });
      await page.keyboard.press("Enter");
      await page.keyboard.type('"baz"', { delay: 10 });

      await expect(nativeEditor(page)).toBeVisible();
      const lines = page.locator(
        "[data-testid=native-query-editor] .cm-line",
      );

      await expectLineTextContent(lines.nth(0), "[");
      await expectLineTextContent(lines.nth(1), "  {");
      await expectLineTextContent(lines.nth(2), '    "foo": "bar",');
      await expectLineTextContent(lines.nth(3), '    "baz"');
      await expectLineTextContent(lines.nth(4), "  }");
      await expectLineTextContent(lines.nth(5), "]");
    });

    test("it should insert a two spaces when pressing tab in json-like languages", async ({
      mb,
      page,
    }) => {
      const MONGO_DB_NAME = "QA Mongo";

      await mb.restore("mongo-5");
      await mb.signInAsAdmin();

      await startNewNativeQuestion(page);
      await page.getByTestId("gui-builder-data").click();
      await page.getByLabel(MONGO_DB_NAME, { exact: true }).click();

      await focusNativeEditor(page);
      await page.keyboard.press("Tab");

      await expect(nativeEditor(page)).toBeVisible();
      const lines = page.locator(
        "[data-testid=native-query-editor] .cm-line",
      );

      await expectLineTextContent(lines.nth(0), "  ");
    });
  });

  test("should be able to handle two sidebars on different screen sizes", async ({
    mb,
    page,
  }) => {
    const questionDetails = {
      name: "13332",
      native: {
        query: "select * from PRODUCTS limit 5",
      },
    };

    const { id } = await createNativeQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // cy.log("open editor on a normal screen size")
    await page.getByTestId("visibility-toggler").click();

    await expect(dataReferenceSidebar(page)).toBeVisible();
    // means data is loaded
    await expect(dataReferenceSidebar(page)).toContainText("Sample Database");

    await page.getByTestId("visibility-toggler").click();
    await expectCypressHidden(dataReferenceSidebar(page));

    // cy.log("open editor on a small screen size")
    await setViewport(page, 1279, 800);

    // cy.log("try to open data reference sidebar on a mid size screen")
    await page.getByTestId("visibility-toggler").click();
    await expectCypressHidden(dataReferenceSidebar(page));

    // cy.log("open visualization settings sidebar, order matters")
    await page.getByTestId("viz-type-button").click();

    // cy.log("open data reference sidebar")
    await icon(
      page.getByTestId("native-query-editor-action-buttons"),
      "reference",
    ).click();

    // cy.log("set small viewport")
    await setViewport(page, 800, 800);

    await expect
      .poll(async () => (await page.getByTestId("sidebar-left").boundingBox())?.width)
      .toBeGreaterThan(350);
    await expect
      .poll(
        async () => (await page.getByTestId("sidebar-right").boundingBox())?.width,
      )
      .toBeGreaterThan(350);
  });
});

/**
 * Upstream: describe("no native access", { tags: ["@external", "@skip"] }).
 * `@skip` excludes it from every CI run, so it is skipped here too — ported
 * in full so it is ready if upstream unskips it.
 *
 * Note the `WRITABLE_DB_ID` (= 2) references: this describe restores the
 * `postgres-12` snapshot, under which database 2 is the READ-ONLY
 * "QA Postgres12" sample, NOT the writable container.
 */
const WRITABLE_DB_ID = 2;

test.describe.skip("no native access", { tag: ["@external"] }, () => {
  // Port of the `{ wrapId: true }` alias the beforeEach creates.
  let questionId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
    await updatePermissionsGraph(mb.api, {
      [ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "blocked",
          "create-queries": "no",
        },
      },
      [NOSQL_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });

    await updateCollectionGraph(mb.api, {
      [NOSQL_GROUP]: { root: "write" },
    });

    ({ id: questionId } = await createNativeQuestion(mb.api, {
      name: "Secret Orders",
      native: {
        query: "SELECT * FROM ORDERS",
      },
      database: WRITABLE_DB_ID,
    }));

    await mb.signIn(cachedUserName("nosql"));
  });

  test("should not display the query when you do not have native access to the data source", async ({
    page,
  }) => {
    await page.goto(`/question/${questionId}`);

    const topBar = page.getByTestId("native-query-top-bar");
    await expect(
      topBar.getByText("This question is written in SQL.", { exact: true }),
    ).toBeVisible();
    await expect(topBar.getByTestId("visibility-toggler")).toHaveCount(0);

    // cy.log("#32387")
    const databases = page.waitForResponse((response) =>
      response.url().includes("/api/database?saved=true"),
    );
    await page.getByRole("button", { name: /New/ }).click();
    await popover(page).getByText("SQL query", { exact: true }).click();

    await databases;
    await page.goBack();

    await expect(
      page
        .getByTestId("native-query-top-bar")
        .getByText("This question is written in SQL.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("native-query-top-bar").getByTestId("visibility-toggler"),
    ).toHaveCount(0);
  });

  test("shows format query button only for sql queries", async ({
    mb,
    page,
  }) => {
    const MONGO_DB_NAME = "QA Mongo";

    await mb.restore("mongo-5");
    await mb.signInAsNormalUser();

    await startNewNativeQuestion(page);
    await page.getByTestId("gui-builder-data").click();
    await page.getByLabel(MONGO_DB_NAME, { exact: true }).click();
    await expect(page.getByLabel("Auto-format", { exact: true })).toHaveCount(0);

    await page
      .getByTestId("native-query-top-bar")
      .getByText(MONGO_DB_NAME, { exact: true })
      .click();

    // Switch to SQL engine which is supported by the formatter
    await popover(page).getByText("Sample Database", { exact: true }).click();

    await focusNativeEditor(page);
    await page.keyboard.type("select * from orders", { delay: 10 });

    // It should load the formatter chunk only when used
    const sqlFormatter = page.waitForResponse((response) =>
      response.url().includes("sql-formatter"),
    );

    await page.getByLabel("Auto-format", { exact: true }).click();

    await sqlFormatter;

    // NOTE: upstream asserts on `.ace_line`, which no longer exists (the
    // editor is CodeMirror). H.NativeEditor.get(".ace_line") also DISCARDS
    // its argument, so upstream's `cy.get("@lines")` was really
    // `cy.get(".ace_line")` — zero elements. Left as-is; the describe is
    // skipped upstream, so this has never run against the current editor.
    const lines = page.locator(".ace_line");
    await expect(lines.nth(0)).toHaveText("SELECT");
    await expect(lines.nth(1)).toHaveText("  *");
    await expect(lines.nth(2)).toHaveText("FROM");
    await expect(lines.nth(3)).toHaveText("  orders");
  });
});

test.describe("scenarios > native question > data reference sidebar", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show tables", async ({ page }) => {
    await startNewNativeQuestion(page);
    await expect(sidebarHeaderTitle(page)).toHaveText("Sample Database");

    const sidebar = dataReferenceSidebar(page);
    await sidebar.getByText("ORDERS", { exact: true }).click();
    await expect(
      sidebar.getByText(
        "Confirmed Sample Company orders for a product, from a user.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(sidebar.getByText("9 columns", { exact: true })).toBeVisible();
    await sidebar.getByText("QUANTITY", { exact: true }).click();
    await expect(
      sidebar.getByText("Number of products bought.", { exact: true }),
    ).toBeVisible();

    // cy.log("clicking the title should navigate back")
    await sidebar.getByText("QUANTITY", { exact: true }).click();
    await sidebar.getByText("ORDERS", { exact: true }).click();
    await sidebarHeaderTitle(page)
      .getByText("Sample Database", { exact: true })
      .click();
    await expect(
      sidebar.getByText("Data Reference", { exact: true }),
    ).toBeVisible();
  });

  test("should show models", async ({ mb, page }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "Native Products Model",
      description: "A model of the Products table",
      native: { query: "select id as renamed_id from products" },
      type: "model",
    });
    // H.createNativeQuestion(..., { visitQuestion: true }) routes models to
    // visitModel — /model/:id runs POST /api/dataset, not /api/card/:id/query.
    await visitModel(page, id);

    // Move question to personal collection
    await openQuestionActions(page);
    await popover(page).getByTestId("move-button").click();

    await pickEntity(page, {
      path: ["Bobby Tables's Personal Collection"],
      select: true,
    });

    await startNewNativeQuestion(page);

    const sidebar = dataReferenceSidebar(page);
    await expect(
      sidebar.getByText("2 models in 2 collections", { exact: true }),
    ).toBeVisible();
    await sidebar
      .getByText("Bobby Tables's Personal Collection", { exact: true })
      .click(); // collection
    await sidebar.getByText("Native Products Model", { exact: true }).click();
    await expect(
      sidebar.getByText("A model of the Products table", { exact: true }),
    ).toBeVisible(); // description
    await expect(sidebar.getByText("1 column", { exact: true })).toBeVisible();
    await sidebar.getByText("RENAMED_ID", { exact: true }).click();
    await expect(
      sidebar.getByText("No description", { exact: true }),
    ).toBeVisible();
  });

  test.describe("metrics", () => {
    test("should not show metrics when they are not defined on the selected table", async ({
      page,
    }) => {
      await startNewNativeQuestion(page);
      await expect(sidebarHeaderTitle(page)).toHaveText("Sample Database");

      const sidebar = dataReferenceSidebar(page);
      await sidebar.getByText("ORDERS", { exact: true }).click();
      // ADDED ANCHOR (see header): upstream asserts absence immediately after
      // the click, which the pre-render state satisfies vacuously. "9 columns"
      // only exists in the loaded table detail.
      await expect(sidebar.getByText("9 columns", { exact: true })).toBeVisible();
      await expect(sidebar.getByText(/metric/)).toHaveCount(0);
    });

    test("should show metrics defined on tables", async ({ mb, page }) => {
      await createQuestion(mb.api, ORDERS_SCALAR_METRIC);

      await startNewNativeQuestion(page);
      await expect(sidebarHeaderTitle(page)).toHaveText("Sample Database");

      const sidebar = dataReferenceSidebar(page);
      await sidebar.getByText("ORDERS", { exact: true }).click();
      await expect(sidebar.getByText("1 metric", { exact: true })).toBeVisible();

      const metric = sidebar.getByText("Count of orders", { exact: true });
      await expect(metric).toBeVisible();
      await metric.click();
      await expect(sidebar.getByText("A metric", { exact: true })).toBeVisible();

      // cy.log("clicking the title should navigate back")
      const metricTitle = sidebar.getByText("Count of orders", { exact: true });
      await expect(metricTitle).toBeVisible();
      await metricTitle.click();
    });
  });
});
