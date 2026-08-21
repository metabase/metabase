/**
 * Port of e2e/test/scenarios/permissions/sandboxing/sandboxing-via-ui.cy.spec.ts
 * (+ the parts of helpers/e2e-sandboxing-helpers.ts it uses).
 *
 * Gates
 * -----
 * - `@external` (suite-level upstream): the `before` hook restores the
 *   `postgres-12` snapshot → gated on PW_QA_DB_ENABLED, like every other
 *   QA-DB port. See findings-inbox for the gate-OFF control and for the
 *   measurement of whether the QA database is actually *used* by this spec.
 * - Token: `H.activateToken("pro-self-hosted")`. Row-and-column security is
 *   gated on the `sandboxes` premium feature, so without a token the whole
 *   file is meaningless → `test.skip(!resolveToken("pro-self-hosted"))`.
 *
 * Setup model
 * -----------
 * Upstream uses a Mocha `before` that builds a heavy fixture and then
 * `H.snapshot("sandboxing-snapshot")`, with every `beforeEach` restoring that
 * snapshot. `mb` is a test-scoped Playwright fixture so it cannot be used from
 * `beforeAll`; the equivalent here is a worker-lifetime `built` flag inside
 * `beforeEach` — the build runs once, then every test (including the first)
 * restores the snapshot, exactly as upstream orders it.
 *
 * Auth
 * ----
 * See the header of support/sandboxing-via-ui.ts. `signInAs` returns an API
 * client for the signed-in user; `mb.api` stays admin (proved by
 * `assertRunningAs`, which this port adds — a deliberate strengthening on a
 * security surface, because the Playwright harness does not give us Cypress's
 * single-cookie-jar guarantee and the failure mode is silent).
 */
import { test, expect } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { modal, popover } from "../support/ui";
import { createQuestionAndDashboard } from "../support/factories";
import { modifyPermission } from "../support/admin-permissions";
import { saveChangesToPermissions } from "../support/command-palette";
import { getDashboardCard } from "../support/dashboard";
import {
  ALL_USERS_GROUP,
  COLLECTION_GROUP,
  DATA_GROUP,
  PEOPLE,
  PEOPLE_ID,
  assertAllResultsAndValuesAreSandboxed,
  assertNoResultsOrValuesAreSandboxed,
  assertRunningAs,
  assertUserGroupIds,
  assignAttributeToUser,
  configureSandboxPolicy,
  createSandboxingDashboardAndQuestions,
  createUserFromRawData,
  gizmoViewer,
  modelCustomView,
  preparePermissions,
  questionCustomView,
  signInAs,
  widgetViewer,
} from "../support/sandboxing-via-ui";
import type { CollectionItem, NormalUser } from "../support/sandboxing-via-ui";

const QA_DB_ENABLED = Boolean(process.env.PW_QA_DB_ENABLED);
const HAS_TOKEN = Boolean(resolveToken("pro-self-hosted"));

/** Saved questions and models we'll try to filter with sandboxing policies */
let sandboxableQuestions: CollectionItem[] = [];
/** A dashboard where we'll put all the saved questions and models we want to test */
let dashboardId: number | null = null;
/** Saved questions and models used as custom views */
let customViews: CollectionItem[] = [];

/** Worker-lifetime: upstream's `before` runs once per file. */
let built = false;

test.describe("admin > permissions > sandboxing (tested via the admin UI)", () => {
  test.skip(
    !QA_DB_ENABLED,
    "@external upstream: the setup restores the postgres-12 snapshot (set PW_QA_DB_ENABLED)",
  );
  test.skip(
    !HAS_TOKEN,
    "Row and column security needs the `sandboxes` feature — set MB_PRO_SELF_HOSTED_TOKEN",
  );

  test.beforeEach(async ({ mb, page }) => {
    test.setTimeout(600_000);

    if (!built) {
      await mb.restore("postgres-12");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      await assertUserGroupIds(mb.api);
      await preparePermissions(mb.api);

      const items = await createSandboxingDashboardAndQuestions(mb.api, page);
      sandboxableQuestions = [];
      customViews = [];
      for (const item of items) {
        if (/Dashboard/i.test(item.name)) {
          dashboardId = item.id;
        } else if (/Question|Model/i.test(item.name)) {
          sandboxableQuestions.push(item);
        } else if (/Custom view/i.test(item.name)) {
          customViews.push(item);
        } else {
          throw new TypeError(`Unexpected collection item: ${item.name}`);
        }
      }
      // Guards against the "green run that measured nothing" shape: if the
      // fixture ever stops producing the cards, every downstream assertion
      // below iterates an empty array and passes.
      expect(dashboardId, "the sandboxing dashboard was created").not.toBeNull();
      expect(
        sandboxableQuestions.length,
        "sandboxable questions were created",
      ).toBeGreaterThan(0);

      await createUserFromRawData(mb.api, gizmoViewer);
      await createUserFromRawData(mb.api, widgetViewer);

      // this setup is a bit heavy, so let's just do it once
      await mb.api.snapshot("sandboxing-snapshot");
      built = true;
    }

    await mb.restore("sandboxing-snapshot");
    // Cypress keeps the admin cookie across restore (the session lives in the
    // snapshot); the Playwright `mb` fixture starts each test signed out.
    await mb.signInAsAdmin();
  });

  test("shows all data before sandboxing policy is applied - gizmoViewer", async ({
    mb,
    context,
    page,
  }) => {
    const api = await signInAs(context, mb.baseUrl, gizmoViewer, mb.api);
    await assertRunningAs(api, gizmoViewer.email);
    await assertNoResultsOrValuesAreSandboxed(
      page,
      api,
      dashboardId!,
      sandboxableQuestions,
    );
  });

  // this test looks like it could be merged with the previous one,
  // but then it flakes at a very high rate
  test("shows all data before sandboxing policy is applied - widgetViewer", async ({
    mb,
    context,
    page,
  }) => {
    const api = await signInAs(context, mb.baseUrl, widgetViewer, mb.api);
    await assertRunningAs(api, widgetViewer.email);
    await assertNoResultsOrValuesAreSandboxed(
      page,
      api,
      dashboardId!,
      sandboxableQuestions,
    );
  });

  test.describe("we can apply a sandbox policy", () => {
    // Upstream's `beforeEach(() => cy.signInAsAdmin())` — the outer beforeEach
    // in this port already re-signs as admin after the restore, so this is the
    // same state. Kept explicit for fidelity.
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
      await assertRunningAs(mb.api, "admin@metabase.test");
    });

    test("to a table filtered using a question as a custom view", async ({
      mb,
      context,
      page,
    }) => {
      await configureSandboxPolicy(page, {
        filterTableBy: "custom_view",
        customViewType: "Question",
        customViewName: questionCustomView.name!,
      });
      // This sandboxing policy doesn't use user attributes. It makes all users
      // see only the Gizmos.
      const gizmoApi = await signInAs(context, mb.baseUrl, gizmoViewer, mb.api);
      await assertRunningAs(gizmoApi, gizmoViewer.email);
      await assertAllResultsAndValuesAreSandboxed(
        page,
        gizmoApi,
        dashboardId!,
        sandboxableQuestions,
        "Gizmo",
      );
      const widgetApi = await signInAs(
        context,
        mb.baseUrl,
        widgetViewer,
        mb.api,
      );
      await assertRunningAs(widgetApi, widgetViewer.email);
      await assertAllResultsAndValuesAreSandboxed(
        page,
        widgetApi,
        dashboardId!,
        sandboxableQuestions,
        "Gizmo",
      );
    });

    test("to a table filtered using a model as a custom view", async ({
      mb,
      context,
      page,
    }) => {
      await configureSandboxPolicy(page, {
        filterTableBy: "custom_view",
        customViewType: "Model",
        customViewName: modelCustomView.name!,
      });
      const gizmoApi = await signInAs(context, mb.baseUrl, gizmoViewer, mb.api);
      await assertRunningAs(gizmoApi, gizmoViewer.email);
      await assertAllResultsAndValuesAreSandboxed(
        page,
        gizmoApi,
        dashboardId!,
        sandboxableQuestions,
        "Gizmo",
      );
      const widgetApi = await signInAs(
        context,
        mb.baseUrl,
        widgetViewer,
        mb.api,
      );
      await assertRunningAs(widgetApi, widgetViewer.email);
      await assertAllResultsAndValuesAreSandboxed(
        page,
        widgetApi,
        dashboardId!,
        sandboxableQuestions,
        "Gizmo",
      );
    });

    test("to a table filtered by a regular column", async ({
      mb,
      context,
      page,
    }) => {
      await assignAttributeToUser(mb.api, {
        user: gizmoViewer,
        attributeValue: "Gizmo",
      });
      await assignAttributeToUser(mb.api, {
        user: widgetViewer,
        attributeValue: "Widget",
      });
      await configureSandboxPolicy(page, {
        filterTableBy: "column",
        filterColumn: "Category",
      });
      const gizmoApi = await signInAs(context, mb.baseUrl, gizmoViewer, mb.api);
      await assertRunningAs(gizmoApi, gizmoViewer.email);
      await assertAllResultsAndValuesAreSandboxed(
        page,
        gizmoApi,
        dashboardId!,
        sandboxableQuestions,
        "Gizmo",
      );
      const widgetApi = await signInAs(
        context,
        mb.baseUrl,
        widgetViewer,
        mb.api,
      );
      await assertRunningAs(widgetApi, widgetViewer.email);
      await assertAllResultsAndValuesAreSandboxed(
        page,
        widgetApi,
        dashboardId!,
        sandboxableQuestions,
        "Widget",
      );
    });
  });

  // Custom columns currently DO work.
  test.describe("should work when applying a sandbox policy...", () => {
    const cases = [
      ["Question", "booleanExpr", "true"],
      ["Question", "booleanLiteral", "true"],
      ["Question", "stringExpr", "Category is Gizmo"],
      ["Question", "stringLiteral", "fixed literal string"],
      ["Question", "numberExpr", "1"],
      ["Question", "numberLiteral", "1"],
      ["Model", "booleanExpr", "true"],
      ["Model", "booleanLiteral", "true"],
      ["Model", "stringExpr", "Category is Gizmo"],
      ["Model", "stringLiteral", "fixed literal string"],
      ["Model", "numberExpr", "1"],
      ["Model", "numberLiteral", "1"],
    ] as const;

    for (const [
      customViewType,
      customColumnType,
      customColumnValue,
    ] of cases) {
      test(`...to a table filtered by a custom ${customColumnType} column in a ${customViewType}`, async ({
        mb,
        context,
        page,
      }) => {
        await mb.signInAsAdmin();
        await assignAttributeToUser(mb.api, {
          user: gizmoViewer,
          attributeValue: customColumnValue,
        });
        await configureSandboxPolicy(page, {
          filterTableBy: "custom_view",
          customViewType,
          customViewName: `${customViewType} with custom columns`,
          filterColumn: `my_${customColumnType}`,
        });
        const api = await signInAs(context, mb.baseUrl, gizmoViewer, mb.api);
        await assertRunningAs(api, gizmoViewer.email);

        await page.goto(`/dashboard/${dashboardId}`);

        const first = getDashboardCard(page, 0);
        await expect(
          first.getByText("Question showing all products", { exact: true }),
        ).toBeVisible();
        await expect(first.getByText("20 rows", { exact: true })).toBeVisible();

        const second = getDashboardCard(page, 1);
        await second.scrollIntoViewIfNeeded();
        await expect(
          second.getByText("Model showing all products", { exact: true }),
        ).toBeVisible();
        await expect(second.getByText("20 rows", { exact: true })).toBeVisible();
      });
    }
  });

  test("filter values are sandboxed", async ({ mb, context, page }) => {
    await mb.signInAsAdmin();

    const filter = {
      id: "c2967a17",
      name: "Location",
      slug: "Location",
      type: "category",
    };

    // `{ body: { id, card_id, dashboard_id } }` upstream — `id` is the dashcard.
    const {
      id,
      card_id,
      dashboard_id: filterDashboardId,
    } = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "People table",
        query: { "source-table": PEOPLE_ID },
      },
      dashboardDetails: { parameters: [filter] },
    });

    await mb.api.put(`/api/dashboard/${filterDashboardId}`, {
      dashcards: [
        {
          id,
          card_id,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 6,
          parameter_mappings: [
            {
              card_id,
              parameter_id: filter.id,
              target: ["dimension", ["field", PEOPLE.STATE, null]],
            },
          ],
        },
      ],
    });

    const userGroupMemberships = [
      { id: ALL_USERS_GROUP, is_group_manager: false },
      { id: DATA_GROUP, is_group_manager: false },
      { id: COLLECTION_GROUP, is_group_manager: false },
    ];

    const users: Record<string, NormalUser> = {
      California: {
        email: "can-see-california-data@example.com",
        password: "--------",
        user_group_memberships: userGroupMemberships,
        login_attributes: { state: "CA" },
      },
      Washington: {
        email: "can-see-washington-data@example.com",
        password: "--------",
        user_group_memberships: userGroupMemberships,
        login_attributes: { state: "WA" },
      },
    };

    for (const user of Object.values(users)) {
      await createUserFromRawData(mb.api, user);
    }

    // Show the permissions configuration for the Sample Database
    await page.goto("/admin/permissions/data/database/1");
    // Show the permissions configuration for the Sample Database's People table
    await page.getByRole("menuitem", { name: /People/ }).click();
    // Modify the sandboxing policy for the 'data' group
    await modifyPermission(page, "data", 0, "Row and column security");

    const changeModal = modal(page);
    await expect(
      changeModal.getByText(
        /Change access to this database to .*Row and column security.*?/,
      ),
    ).toHaveCount(1);
    await changeModal
      .getByRole("button", { name: "Change", exact: true })
      .click();

    await expect(
      modal(page).getByText(/Configure row and column security for this table/),
    ).toHaveCount(1);
    await expect(
      page.getByRole("radio", { name: /Filter by a column in the table/ }),
    ).toBeChecked();
    await modal(page)
      .getByRole("button", { name: /Pick a column/ })
      .click();
    await page.getByRole("option", { name: "State", exact: true }).click();
    await modal(page).getByPlaceholder(/Pick a user attribute/).click();
    await page.getByRole("option", { name: "state", exact: true }).click();
    // Save the sandboxing modal
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();

    await saveChangesToPermissions(page);

    // Create two sandboxed users with different attributes (state=CA, state=WA).
    // Our goal is to ensure that the second user can't see the filter value
    // selected by the first user.
    await signInAs(context, mb.baseUrl, users.California, mb.api);
    await page.goto(`/dashboard/${filterDashboardId}`);

    await page.getByLabel("Location").click();
    const caPopover = popover(page);
    await caPopover.getByLabel("CA").click();
    await expect(caPopover.getByLabel("WA")).toHaveCount(0);
    await caPopover.getByLabel("Add filter").click();

    await signInAs(context, mb.baseUrl, users.Washington, mb.api);
    await page.goto(`/dashboard/${filterDashboardId}`);
    await page.getByLabel("Location").click();
    const waPopover = popover(page);
    // The filter value selected by the previous user should not be visible
    await expect(waPopover.getByLabel("CA")).toHaveCount(0);
    // The one filter value available to the current user should be visible
    await expect(waPopover.getByLabel("Select all")).toBeVisible();
    await expect(waPopover.getByLabel("WA")).toBeVisible();
    // Ensure that only 'WA' and 'Select all' are visible
    await expect(
      waPopover.getByTestId("field-values-widget").locator("li"),
    ).toHaveCount(2);
  });
});
