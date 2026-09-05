/**
 * Playwright port of
 * e2e/test/scenarios/collections/personal-collections.cy.spec.js
 *
 * Port notes:
 * - metabase#24330 is tagged `@skip` upstream (Cypress skips it) → ported as a
 *   faithful `test.skip`, body and all.
 * - The response-modifying `cy.intercept("/api/session/properties")` (the
 *   "link to other users' personal collections" test) becomes a `page.route`
 *   that fetches the real response and rewrites `active-users-count`. A single
 *   mutable variable stands in for the two successive intercepts.
 * - `cy.findByDisplayValue("Foo")` targets the collection-name EditableText,
 *   which renders a <textarea> → shared filters-repros.findByDisplayValue
 *   (input+textarea+select scan; PORTING gotcha).
 * - The "all users" describe iterates ALL 10 snapshot users (Object.keys(USERS)).
 *   Each signs in via the cached-session cookie (signInWithCachedSession) — the
 *   flow is entirely UI-driven, so no mb.api session is needed.
 * - openNavigationSidebar() is used defensively after an EditableText rename
 *   (rename can collapse the navbar — PORTING gotcha).
 */
import type { Page, Route } from "@playwright/test";

import { createCollection } from "../support/dashboard-core";
import { findByDisplayValue } from "../support/filters-repros";
import { getCollectionActions } from "../support/collections-cleanup";
import { openCollectionMenu } from "../support/collections-core";
import { test, expect } from "../support/fixtures";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  signInWithCachedSession,
} from "../support/permissions";
import {
  ALL_TEST_USERS,
  NO_DATA_PERSONAL_COLLECTION_ID,
  NORMAL_USER_ID,
  addNewCollection,
  appendToPlaceholderField,
} from "../support/personal-collections";
import { visitCollection } from "../support/question-new";
import {
  icon,
  modal,
  navigationSidebar,
  openNavigationSidebar,
  popover,
} from "../support/ui";

test.describe("personal collections", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test.describe("admin", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
    });

    /**
     * This reproduction is here only as a placeholder until a proper backend
     * test is added. Tagged @skip upstream, so it never runs.
     */
    test.skip(
      "shouldn't get API response containing all other personal collections when visiting the home page (metabase#24330)",
      async ({ page }) => {
        const getCollections = page.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            new URL(response.url()).pathname === "/api/collection/tree",
        );

        await page.goto("/");

        const body = await (await getCollections).json();
        const personalCollections = body.filter(
          ({ personal_owner_id }: { personal_owner_id: number | null }) =>
            personal_owner_id !== null,
        );

        // Admin can only see their own personal collection, so this list should
        // return only that. Loading all other users' personal collections can
        // lead to performance issues!
        expect(personalCollections).toHaveLength(1);
      },
    );

    test("should see a link to other users' personal collections only if there are other users", async ({
      page,
    }) => {
      let activeUsersCount = 1;
      await page.route("**/api/session/properties", async (route: Route) => {
        const response = await route.fetch();
        const body = await response.json();
        body["active-users-count"] = activeUsersCount;
        await route.fulfill({ response, json: body });
      });

      await page.goto("/");

      await expect(
        navigationSidebar(page).getByLabel(
          "Other users' personal collections",
          { exact: true },
        ),
      ).toHaveCount(0);

      activeUsersCount = 2;
      await page.reload();

      await expect(
        navigationSidebar(page).getByLabel(
          "Other users' personal collections",
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("should be able to view their own as well as other users' personal collections (including other admins)", async ({
      page,
      mb,
    }) => {
      // Turn normal user into another admin
      await mb.api.put(`/api/user/${NORMAL_USER_ID}`, { is_superuser: true });

      await page.goto("/collection/root");
      await expect(
        page
          .getByRole("tree")
          .getByText("Your personal collection", { exact: true })
          .first(),
      ).toBeVisible();
      await navigationSidebar(page)
        .getByLabel("Other users' personal collections", { exact: true })
        .click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/collection/users");
      await expect(
        page.getByTestId("browsercrumbs").getByText(/All personal collections/i),
      ).toBeVisible();
      for (const { fullName } of ALL_TEST_USERS) {
        await expect(
          page.getByText(fullName, { exact: true }).first(),
        ).toBeVisible();
      }
    });

    test("cannot edit details for personal collections nor change permissions for personal collections or sub-collections (metabase#8406)", async ({
      page,
      mb,
    }) => {
      // Let's use the API to create a sub-collection "Foo" in admin's personal
      // collection
      await mb.api.post("/api/collection", {
        name: "Foo",
        parent_id: ADMIN_PERSONAL_COLLECTION_ID,
      });

      await visitCollection(page, ADMIN_PERSONAL_COLLECTION_ID);

      // Make sure it's not possible to edit personal collection's permissions
      await expect(
        icon(getCollectionActions(page), "info"),
      ).not.toHaveCount(0);
      await expect(icon(getCollectionActions(page), "ellipsis")).toHaveCount(0);

      // Go to the newly created sub-collection "Foo"
      await navigationSidebar(page).getByText("Foo", { exact: true }).click();
      await expect(await findByDisplayValue(page.locator("body"), "Foo")).toBeEnabled();

      // Other menu options exist, but editing permissions is not possible
      await openCollectionMenu(page);
      await expect(
        popover(page).getByText("Move to trash", { exact: true }),
      ).toBeVisible();
      await expect(
        popover(page).getByText("Edit permissions", { exact: true }),
      ).toHaveCount(0);

      // Go to random user's personal collection
      await visitCollection(page, NO_DATA_PERSONAL_COLLECTION_ID);

      await expect(
        icon(getCollectionActions(page), "info"),
      ).not.toHaveCount(0);
      await expect(icon(getCollectionActions(page), "ellipsis")).toHaveCount(0);
    });

    test("should be able view other users' personal sub-collections (metabase#15339)", async ({
      page,
      mb,
    }) => {
      await createCollection(mb.api, {
        name: "Foo",
        parent_id: NO_DATA_PERSONAL_COLLECTION_ID,
      });

      await page.goto(`/collection/${NO_DATA_PERSONAL_COLLECTION_ID}`);
      await expect(page.getByText("Foo", { exact: true }).first()).toBeVisible();
    });
  });

  test.describe("all users", () => {
    for (const { key } of ALL_TEST_USERS) {
      test.describe(`${key} user`, () => {
        test.beforeEach(async ({ page, context }) => {
          await signInWithCachedSession(context, key);

          await page.goto("/collection/root");
          await navigationSidebar(page)
            .getByText("Your personal collection", { exact: true })
            .click();

          // Create initial collection inside the personal collection and
          // navigate to it
          await addNewCollection(page, "Foo");
          await navigationSidebar(page)
            .getByText("Foo", { exact: true })
            .click();
        });

        test("should be able to edit collection(s) inside personal collection", async ({
          page,
        }) => {
          // Create new collection inside previously added collection
          await addNewCollection(page, "Bar");
          await navigationSidebar(page)
            .getByText("Bar", { exact: true })
            .click();
          await appendToPlaceholderField(page, "Add title", "1");
          await appendToPlaceholderField(page, "Add description", "ex-bar");

          // A rename via EditableText can collapse the navbar (PORTING gotcha)
          await openNavigationSidebar(page);
          await navigationSidebar(page)
            .getByText("Foo", { exact: true })
            .click();
          await expect(
            navigationSidebar(page).getByText("Bar1", { exact: true }),
          ).toBeVisible();

          // should be able to archive collection(s) inside personal collection
          // (metabase#15343)
          await openCollectionMenu(page);
          await popover(page).getByText("Move to trash", { exact: true }).click();
          await modal(page)
            .getByRole("button", { name: "Move to trash", exact: true })
            .click();
          await expect(page.getByTestId("toast-undo")).toContainText(
            "Trashed collection",
          );
          await expect(
            navigationSidebar(page).getByText("Foo", { exact: true }),
          ).toHaveCount(0);
        });
      });
    }
  });
});
