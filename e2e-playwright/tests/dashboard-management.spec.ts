/**
 * Playwright port of e2e/test/scenarios/dashboard/dashboard-management.cy.spec.js
 *
 * Port notes:
 * - The Cypress PERMISSIONS map also lists a "no" group (nocollection,
 *   nosql, none), but its `onlyOn` guards generate no tests for it — only
 *   the two groups below produce test cases.
 * - The spec's assertOnRequest(alias) pattern becomes waitFor* promises
 *   registered before each triggering action, awaited via assertOnRequest.
 * - cy.wrap(...).as("originalDashboardId") / .as("dashboardQuestionId")
 *   aliases are replaced by plain variables holding the created ids.
 */
import { expect, test } from "../support/fixtures";
import {
  getDashboardCard,
  modal,
  saveDashboard,
} from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import {
  USER_NAMES,
  addOrUpdateDashboardCard,
  addTextBox,
  assertOnRequest,
  closeDashboardInfoSidebar,
  collectionEntry,
  createDashboardQuestion,
  createNativeQuestionAndDashboard,
  openDashboardInfoSidebar,
  waitForDashboardCopy,
  waitForDashboardGet,
  waitForDashboardUpdate,
} from "../support/dashboard-management";
import { tooltip } from "../support/charts";
import { undoToast } from "../support/metrics";
import { entityPickerModal } from "../support/notebook";
import { openDashboardMenu } from "../support/organization";
import { collectionOnTheGoModal } from "../support/question-new";
import { sidesheet } from "../support/revisions";
import {
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import {
  appBar,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  visitDashboard,
} from "../support/ui";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
} as const;

const questionDetails = {
  name: "Q1",
  native: { query: "SELECT  '42' as ANSWER" },
  display: "scalar",
};

const dashboardName = "FooBar";

test.describe("managing dashboard from the dashboard's edit menu", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test.describe("curate access", () => {
    for (const user of PERMISSIONS.curate) {
      test.describe(`${user} user`, () => {
        let originalDashboardId: number;

        test.beforeEach(async ({ page, mb }) => {
          await mb.signInAsAdmin();
          const { dashboardId } = await createNativeQuestionAndDashboard(
            mb.api,
            {
              questionDetails,
              dashboardDetails: { name: dashboardName },
            },
          );
          originalDashboardId = dashboardId;

          await mb.signIn(user);

          const getDashboard = waitForDashboardGet(page, dashboardId);
          await visitDashboard(page, mb.api, dashboardId);
          await assertOnRequest(page, getDashboard);

          await openDashboardMenu(page);
        });

        test("should be able to change title and description", async ({
          page,
        }) => {
          const id = originalDashboardId;

          // EditableText: fill() doesn't mark it dirty — click (which also
          // dismisses the menu opened in beforeEach), type, blur, and anchor
          // on the PUT fired by the blur.
          const heading = page.getByTestId("dashboard-name-heading");
          await heading.click();
          await heading.press("End");
          await heading.pressSequentially("1");
          const titleUpdate = waitForDashboardUpdate(page, id);
          const titleGet = waitForDashboardGet(page, id);
          await heading.blur();
          await assertOnRequest(page, titleUpdate);
          await assertOnRequest(page, titleGet);

          await openDashboardInfoSidebar(page);

          const description = sidesheet(page).getByPlaceholder(
            "Add description",
            { exact: true },
          );
          await description.click();
          await description.pressSequentially("Foo");
          const descriptionUpdate = waitForDashboardUpdate(page, id);
          const descriptionGet = waitForDashboardGet(page, id);
          await description.blur();
          await closeDashboardInfoSidebar(page);

          await assertOnRequest(page, descriptionUpdate);
          await assertOnRequest(page, descriptionGet);

          const reloadGet = waitForDashboardGet(page, id);
          await page.reload();
          await assertOnRequest(page, reloadGet);
          await expect(heading).toHaveValue(`${dashboardName}1`);
        });

        test("should shallow duplicate a dashboard but not its cards", async ({
          page,
        }) => {
          const id = originalDashboardId;
          const newDashboardName = `${dashboardName} - Duplicate`;
          const { name: originalQuestionName } = questionDetails;
          const newQuestionName = `${originalQuestionName} - Duplicate`;
          const newDashboardId = id + 1;

          // add virtual card to check shallow copy checkbox plays nicely
          await addTextBox(page, "Foo bar baz");
          await saveDashboard(page);
          await openDashboardMenu(page);

          const duplicateOption = popover(page).getByText("Duplicate", {
            exact: true,
          });
          await expect(duplicateOption).toBeVisible();
          await duplicateOption.click();
          await expect(page).toHaveURL(new RegExp(`/dashboard/${id}/copy$`));

          const dialog = modal(page);
          await expect(
            dialog.getByRole("heading", {
              name: `Duplicate "${dashboardName}" and its questions`,
              exact: true,
            }),
          ).toBeVisible();
          await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
            newDashboardName,
          );

          const shallowCopyCheckbox = dialog.getByLabel(
            "Only duplicate the dashboard",
          );
          await expect(shallowCopyCheckbox).not.toBeChecked();
          await expect(shallowCopyCheckbox).toBeEnabled();
          // force: the Mantine checkbox input is visually covered by its
          // styled box (same story as the role="switch" gotcha).
          await shallowCopyCheckbox.click({ force: true });
          await expect(shallowCopyCheckbox).toBeChecked();
          await expect(
            dialog.getByRole("heading", {
              name: `Duplicate "${dashboardName}"`,
              exact: true,
            }),
          ).toBeVisible();

          const copyDashboard = waitForDashboardCopy(page, id);
          await dialog
            .getByRole("button", { name: "Duplicate", exact: true })
            .click();
          await assertOnRequest(page, copyDashboard);

          await expect(page).toHaveURL(
            new RegExp(`/dashboard/${newDashboardId}`),
          );

          await expect(page.getByTestId("dashboard-name-heading")).toHaveValue(
            newDashboardName,
          );
          await appBar(page)
            .getByText("Our analytics", { exact: true })
            .click();

          await expect(
            collectionEntry(page, dashboardName),
          ).not.toHaveCount(0);
          await expect(
            collectionEntry(page, newDashboardName),
          ).not.toHaveCount(0);
          await expect(
            collectionEntry(page, originalQuestionName),
          ).not.toHaveCount(0);
          await expect(collectionEntry(page, newQuestionName)).toHaveCount(0);
        });

        test("should deep duplicate a dashboard and its cards", async ({
          page,
        }) => {
          const id = originalDashboardId;
          const newDashboardName = `${dashboardName} - Duplicate`;
          const { name: originalQuestionName } = questionDetails;
          const newQuestionName = `${originalQuestionName} - Duplicate`;
          const newDashboardId = id + 1;

          const duplicateOption = popover(page).getByText("Duplicate", {
            exact: true,
          });
          await expect(duplicateOption).toBeVisible();
          await duplicateOption.click();
          await expect(page).toHaveURL(new RegExp(`/dashboard/${id}/copy$`));

          const dialog = modal(page);
          await expect(
            dialog.getByRole("heading", {
              name: `Duplicate "${dashboardName}" and its questions`,
              exact: true,
            }),
          ).toBeVisible();
          await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
            newDashboardName,
          );
          await expect(
            dialog.getByLabel("Only duplicate the dashboard"),
          ).not.toBeChecked();
          await icon(dialog, "info").hover();

          // The ellipsis-button tooltip from the beforeEach can still be
          // mounted — scope to the tooltip we actually mean.
          await expect(
            tooltip(page).filter({ hasText: /If you check this/ }),
          ).toContainText(
            "If you check this, the cards in the duplicated dashboard will reference the original questions.",
          );

          const copyDashboard = waitForDashboardCopy(page, id);
          await dialog
            .getByRole("button", { name: "Duplicate", exact: true })
            .click();
          await assertOnRequest(page, copyDashboard);

          await expect(page).toHaveURL(
            new RegExp(`/dashboard/${newDashboardId}`),
          );

          await expect(page.getByTestId("dashboard-name-heading")).toHaveValue(
            newDashboardName,
          );
          await appBar(page)
            .getByText("Our analytics", { exact: true })
            .click();

          await expect(
            collectionEntry(page, dashboardName),
          ).not.toHaveCount(0);
          await expect(
            collectionEntry(page, newDashboardName),
          ).not.toHaveCount(0);
          await expect(
            collectionEntry(page, originalQuestionName),
          ).not.toHaveCount(0);
          await expect(
            collectionEntry(page, newQuestionName),
          ).not.toHaveCount(0);
        });

        test("should deep duplicate a dashboard and its cards to a collection created on the go", async ({
          page,
        }) => {
          const id = originalDashboardId;
          const newDashboardName = `${dashboardName} - Duplicate`;
          const { name: originalQuestionName } = questionDetails;
          const newQuestionName = originalQuestionName;
          const newDashboardId = id + 1;

          const duplicateOption = popover(page).getByText("Duplicate", {
            exact: true,
          });
          await expect(duplicateOption).toBeVisible();
          await duplicateOption.click();
          await expect(page).toHaveURL(new RegExp(`/dashboard/${id}/copy$`));

          const dialog = modal(page);
          await expect(
            dialog.getByRole("heading", {
              name: `Duplicate "${dashboardName}" and its questions`,
              exact: true,
            }),
          ).toBeVisible();
          await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
            newDashboardName,
          );
          await expect(
            dialog.getByLabel("Only duplicate the dashboard"),
          ).not.toBeChecked();
          await dialog.getByTestId("collection-picker-button").click();

          await entityPickerModal(page)
            .getByText("New collection", { exact: true })
            .click();
          const NEW_COLLECTION = "Foo Collection";
          const onTheGoModal = collectionOnTheGoModal(page);
          await onTheGoModal
            .getByPlaceholder("My new collection", { exact: true })
            .fill(NEW_COLLECTION);
          await onTheGoModal
            .getByRole("button", { name: "Create", exact: true })
            .click();
          await entityPickerModal(page)
            .getByRole("button", { name: "Select", exact: true })
            .click();

          const copyDashboard = waitForDashboardCopy(page, id);
          await dialog
            .getByRole("button", { name: "Duplicate", exact: true })
            .click();
          await assertOnRequest(page, copyDashboard);

          await expect(page).toHaveURL(
            new RegExp(`/dashboard/${newDashboardId}`),
          );

          await expect(page.getByTestId("dashboard-name-heading")).toHaveValue(
            newDashboardName,
          );
          await appBar(page)
            .getByText(NEW_COLLECTION, { exact: true })
            .click();
          await expect(
            collectionEntry(page, newDashboardName),
          ).not.toHaveCount(0);
          await expect(
            collectionEntry(page, newQuestionName),
          ).not.toHaveCount(0);

          await openNavigationSidebar(page);
          await navigationSidebar(page)
            .getByText("Our analytics", { exact: true })
            .click();
          await expect(
            collectionEntry(page, dashboardName),
          ).not.toHaveCount(0);
          await expect(
            collectionEntry(page, originalQuestionName),
          ).not.toHaveCount(0);
        });

        test("should be able to move/undo move a dashboard (metabase#13059, metabase#25705)", async ({
          page,
        }) => {
          const id = originalDashboardId;

          await expect(appBar(page)).toContainText("Our analytics");

          await popover(page).getByText("Move", { exact: true }).click();
          await expect(page).toHaveURL(new RegExp(`/dashboard/${id}/move$`));

          const picker = entityPickerModal(page);
          await picker.getByText("Our analytics", { exact: true }).click();
          await picker.getByText("First collection", { exact: true }).click();
          const moveUpdate = waitForDashboardUpdate(page, id);
          await picker
            .getByRole("button", { name: "Move", exact: true })
            .click();

          await assertOnRequest(page, moveUpdate);
          await expect(getDashboardCard(page)).toContainText("42");

          // it should update dashboard's collection after the move without
          // the page reload (metabase#13059)
          await expect(appBar(page)).toContainText("First collection");
          await expect(appBar(page)).not.toContainText("Our analytics");

          const toast = undoToast(page);
          await expect(toast).toContainText(
            "Dashboard moved to First collection",
          );
          const undoUpdate = waitForDashboardUpdate(page, id);
          await toast
            .getByRole("button", { name: "Undo", exact: true })
            .click();
          await assertOnRequest(page, undoUpdate);

          await expect(appBar(page)).toContainText("Our analytics");
          await expect(appBar(page)).not.toContainText("First collection");
        });

        test("should be able to archive/unarchive a dashboard", async ({
          page,
        }) => {
          const id = originalDashboardId;

          const trashOption = popover(page).getByText("Move to trash", {
            exact: true,
          });
          await expect(trashOption).toBeVisible();
          await trashOption.click();

          await expect(page).toHaveURL(
            new RegExp(`/dashboard/${id}/archive$`),
          );
          const dialog = modal(page);
          // Without this, there is some race condition and the button click
          // fails
          await expect(
            dialog.getByRole("heading", {
              name: "Move this dashboard to trash?",
              exact: true,
            }),
          ).toBeVisible();
          const archiveUpdate = waitForDashboardUpdate(page, id);
          await dialog
            .getByRole("button", { name: "Move to trash", exact: true })
            .click();
          await assertOnRequest(page, archiveUpdate);

          await expect(page).toHaveURL(new RegExp(`/dashboard/${id}$`));

          await expect(page.getByTestId("archive-banner")).toBeVisible();

          const toast = undoToast(page);
          await expect(
            toast.getByText("FooBar has been moved to the trash.", {
              exact: true,
            }),
          ).toBeVisible();
          const unarchiveUpdate = waitForDashboardUpdate(page, id);
          await toast
            .getByRole("button", { name: "Undo", exact: true })
            .click();
          await assertOnRequest(page, unarchiveUpdate);

          await page.goto("/collection/root");
          await expect(
            collectionEntry(page, dashboardName),
          ).not.toHaveCount(0);
        });
      });
    }
  });

  test.describe("view access", () => {
    for (const user of PERMISSIONS.view) {
      test.beforeEach(async ({ page, mb }) => {
        await mb.signIn(user);

        await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

        const ellipsis = icon(page.locator("main header"), "ellipsis");
        await expect(ellipsis).toBeVisible();
        await ellipsis.click();
      });

      test("should not be offered to edit dashboard details or archive the dashboard for dashboard in collections they have `read` access to (metabase#15280)", async ({
        page,
      }) => {
        const menu = popover(page);
        await expect(menu).toBeVisible();
        await expect(
          menu.getByText("Edit dashboard details", { exact: true }),
        ).toHaveCount(0);

        await expect(
          menu.getByText("Move to trash", { exact: true }),
        ).toHaveCount(0);
      });

      test("should be offered to duplicate dashboard in collections they have `read` access to", async ({
        page,
      }) => {
        const { first_name, last_name } = USER_NAMES[user];

        await popover(page).getByText("Duplicate", { exact: true }).click();
        await expect(
          page.getByTestId("collection-picker-button"),
        ).toHaveText(`${first_name} ${last_name}'s Personal Collection`);
      });
    }
  });

  test("should be prevented from doing a shallow copy if the dashboard contains a dashboard question", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();

    const { dashboardId } = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails: { name: dashboardName },
    });
    const card = await createDashboardQuestion(mb.api, {
      name: "Foo dashboard question",
      query: { "source-table": SAMPLE_DATABASE.ORDERS_ID, limit: 5 },
      dashboard_id: dashboardId,
    });
    await addOrUpdateDashboardCard(mb.api, {
      card_id: card.id,
      dashboard_id: dashboardId,
    });
    await visitDashboard(page, mb.api, dashboardId);

    await openDashboardMenu(page);
    const duplicateOption = popover(page).getByText("Duplicate", {
      exact: true,
    });
    await expect(duplicateOption).toBeVisible();
    await duplicateOption.click();

    const dialog = modal(page);
    await expect(
      dialog.getByRole("heading", {
        name: `Duplicate "${dashboardName}" and its questions`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel("Only duplicate the dashboard"),
    ).toHaveCount(0);
  });
});
