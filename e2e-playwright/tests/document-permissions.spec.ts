/**
 * Playwright port of e2e/test/scenarios/documents/document-permissions.cy.spec.ts
 *
 * Who can view/edit/share a document based on its collection permissions.
 *
 * Notes:
 * - Snowplow helpers are no-op stubs (no snowplow-micro container in the
 *   spike harness — porting rule 6). The one snowplow assertion the spec
 *   makes (document_created) becomes a no-op.
 * - `cy.signIn("none")` targets a user that lives in the snapshot login cache
 *   but not the harness USERS credential map, so signIn resolves it via the
 *   cache — hence the `as UserName` widening (same shape as documents.spec's
 *   "nocollection" cast).
 * - The Cypress createDocument's `alias`/`idAlias` are cy-only artifacts; the
 *   ported createDocument returns the id directly.
 */
import type { Page } from "@playwright/test";

import {
  ALL_USERS_GROUP,
  newDocumentFromNewMenu,
  updateCollectionGraph,
} from "../support/document-permissions";
import {
  addToDocument,
  createDocument,
  documentContent,
  documentSaveButton,
  visitDocument,
} from "../support/documents-core";
import { test, expect } from "../support/fixtures";
import { entityPickerModal, entityPickerModalLevel } from "../support/notebook";
import { entityPickerModalItem } from "../support/question-new";
import type { UserName } from "../support/sample-data";
import { appBar, collectionTable } from "../support/ui";

// TODO: no snowplow-micro container in the spike harness (porting rule 6).
const resetSnowplow = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

const documentTitleInput = (page: Page) =>
  page.getByRole("textbox", { name: "Document Title", exact: true });

test.describe("document permissions", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await resetSnowplow();
    await mb.signOut();
  });

  test("should allow a non-admin user to create a new document and save it", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();

    await updateCollectionGraph(mb.api, {
      [ALL_USERS_GROUP]: { root: "none" },
    });

    await mb.signOut();

    await mb.signIn("none" as UserName);

    await page.goto("/");

    await newDocumentFromNewMenu(page);
    await expect(page).toHaveTitle("New document · Metabase");

    const title = documentTitleInput(page);
    await expect(title).toBeFocused();
    await title.pressSequentially("User Document");

    await documentContent(page).click();
    await addToDocument(
      page,
      "This is a document created by a non-admin user",
      false,
    );

    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(
      entityPickerModalLevel(page, 0).getByText("Our analytics", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(entityPickerModalItem(page, 0, "Collections")).toBeAttached();

    await entityPickerModalItem(page, 0, /Personal Collection/).click();
    await entityPickerModal(page)
      .getByRole("button", { name: "Select", exact: true })
      .click();

    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/document\/\d+/);
    await expect(page).toHaveTitle("User Document · Metabase");

    await expectUnstructuredSnowplowEvent({ event: "document_created" });

    await appBar(page)
      .getByRole("link", { name: /Personal Collection/ })
      .click();

    await expect(
      collectionTable(page).getByRole("link", {
        name: "User Document",
        exact: true,
      }),
    ).toBeAttached();
  });

  test("should allow a non-admin user to edit their own document", async ({
    page,
    mb,
  }) => {
    await mb.signInAsNormalUser();

    const doc = await createDocument(mb.api, {
      name: "User Document",
      document: {
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Original content",
              },
            ],
            attrs: {
              _id: "1",
            },
          },
        ],
        type: "doc",
      },
      collection_id: null,
    });

    await visitDocument(page, doc.id);

    await expect(documentContent(page)).toContainText("Original content");

    await expect(
      documentContent(page).getByRole("textbox"),
    ).toHaveAttribute("contenteditable", "true");

    await documentContent(page).click();
    await addToDocument(page, " and some new content");

    await documentSaveButton(page).click();

    await expect(
      page.getByTestId("toast-undo").getByText("Document saved", { exact: true }),
    ).toBeVisible();

    await expect(documentContent(page)).toContainText(
      "Original content and some new content",
    );
  });
});
