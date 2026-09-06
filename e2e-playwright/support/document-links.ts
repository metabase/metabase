/**
 * Helpers for the document-links spec port
 * (e2e/test/scenarios/documents/document-links.cy.spec.ts).
 *
 * Ports:
 * - the spec-local openLinkSuggestionBrowseAllPicker / openLinkMentionMenuBrowseAllPicker
 * - H.documentMentionItem (e2e-document-helpers.ts) — the shared documents-core
 *   module exports documentMentionDialog but not the item accessor, and we may
 *   not edit shared files from a port, so it lives here.
 *
 * Everything the shared documents-core module already provides
 * (documentContent, addToDocument, commandSuggestionItem, …) is imported
 * read-only.
 */
import type { Locator, Page } from "@playwright/test";

import {
  addToDocument,
  commandSuggestionItem,
  documentContent,
  documentMentionDialog,
} from "./documents-core";

/** Port of H.documentMentionItem (findByRole name strings are exact). */
export function documentMentionItem(
  page: Page,
  name: string | RegExp,
): Locator {
  return documentMentionDialog(page).getByRole("option", {
    name,
    exact: typeof name === "string",
  });
}

/**
 * Port of the spec-local openLinkSuggestionBrowseAllPicker: focus the editor,
 * open the "/" command menu, pick Link, then "Browse all".
 */
export async function openLinkSuggestionBrowseAllPicker(page: Page) {
  await documentContent(page).click();

  // Trigger suggestion menu with /
  await addToDocument(page, "/", false);

  // Select Link from the suggestion menu
  await commandSuggestionItem(page, "Link").click();

  await commandSuggestionItem(page, /Browse all/).click();
}

/**
 * Port of the spec-local openLinkMentionMenuBrowseAllPicker: focus the editor,
 * open the "@" mention menu, then "Browse all".
 */
export async function openLinkMentionMenuBrowseAllPicker(page: Page) {
  await documentContent(page).click();

  // Trigger mention menu with @
  await addToDocument(page, "@", false);

  await documentMentionItem(page, /Browse all/).click();
}
