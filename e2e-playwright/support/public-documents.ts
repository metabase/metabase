/**
 * Helpers for the public-documents port
 * (e2e/test/scenarios/documents/public-documents.cy.spec.ts).
 *
 * Ports of:
 * - H.createPublicDocumentLink (e2e-embedding-helpers.js) — note the endpoint
 *   is `/api/document/:id/public-link` (dash), NOT the underscore
 *   `.../public_link` used by card/dashboard/action, so it can't reuse
 *   support/public-sharing.ts's `createPublicLink`.
 * - the spec-local visitPublicDocument / verifyDocumentIsReadOnly /
 *   verifyCommentsAreHidden / verifyErrorMessage.
 *
 * The document node getters, card getters and openDocumentCardMenu are imported
 * read-only from the shared documents modules (documents.ts / documents-core.ts).
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { getDocumentNodeButtons } from "./documents";
import { documentContent } from "./documents-core";
import { expect } from "./fixtures";

/**
 * Port of H.createPublicDocumentLink: mint a public link for a document and
 * return its uuid. The Cypress helper POSTs `/api/document/:id/public-link`.
 */
export async function createPublicDocumentLink(
  api: MetabaseApi,
  documentId: number,
): Promise<string> {
  const response = await api.post(
    `/api/document/${documentId}/public-link`,
    {},
  );
  const { uuid } = (await response.json()) as { uuid: string };
  return uuid;
}

/** Port of the spec-local visitPublicDocument: navigate to the public route. */
export async function visitPublicDocument(page: Page, uuid: string) {
  await page.goto(`/public/document/${uuid}`);
}

/**
 * Port of the spec-local verifyDocumentIsReadOnly: the editor textbox is
 * contenteditable="false" and there is no Save button.
 */
export async function verifyDocumentIsReadOnly(page: Page) {
  await expect(documentContent(page).getByRole("textbox")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
}

/**
 * Port of the spec-local verifyCommentsAreHidden: no per-node comment buttons,
 * no comments sidebar, no "Show all comments" link.
 */
export async function verifyCommentsAreHidden(page: Page) {
  await expect(getDocumentNodeButtons(page)).toHaveCount(0);
  await expect(page.getByTestId("comments-sidebar")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Show all comments", exact: true }),
  ).toHaveCount(0);
}

/**
 * Port of the spec-local verifyErrorMessage: PublicError / PublicNotFound
 * render the message on an error page, and the document content is gone.
 * `cy.contains` is a case-sensitive substring — mirror with a substring regex,
 * `.first()` because the error text can appear more than once (title + body).
 */
export async function verifyErrorMessage(page: Page, expectedMessage: string) {
  const escaped = expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(page.getByText(new RegExp(escaped)).first()).toBeVisible();
  await expect(documentContent(page)).toHaveCount(0);
}
