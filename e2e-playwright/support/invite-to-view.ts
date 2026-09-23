/**
 * Helpers for the invite-to-view port (e2e/test/scenarios/sharing/invite-to-view.cy.spec.js).
 * Own module so the shared support files stay untouched (porting rule 9).
 *
 * Ports of the spec-local helpers: inviteEmail, inviteFromShareMenu,
 * joinUrlFromEmail, completeSignup, enableGoogleSSO.
 */
import { expect, type Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { openSharingMenu } from "./sharing";
import { modal } from "./ui";

/** Port of the spec-local PASSWORD. */
export const PASSWORD = "Sup3r-S3cret-Pw!";

/** Port of the spec-local inviteEmail(). */
export function inviteEmail(): string {
  return `invitee-${Math.round(Math.random() * 1_000_000)}@metabase.test`;
}

/**
 * Port of the spec-local inviteFromShareMenu: open the Share menu on the
 * current dashboard/question and invite `email`.
 *
 * `cy.findByLabelText(/Email/i)` is a case-insensitive substring regex, so it
 * ports as a regex here rather than an exact string (rule 1 covers the string
 * form only).
 */
export async function inviteFromShareMenu(page: Page, email: string) {
  await openSharingMenu(page, "Invite someone to view this");
  const dialog = modal(page);
  await dialog.getByLabel(/Email/i).fill(email);
  await dialog.getByRole("button", { name: "Send invitation", exact: true }).click();
}

/**
 * Port of the spec-local joinUrlFromEmail: pull the Join link out of a sent
 * invite email and decode the HTML entities handlebars escaped into it.
 */
export function joinUrlFromEmail(html: string): string {
  const match = html.match(/href="([^"]*reset_password[^"]*)"/);
  expect(match, "the invite email contains a reset_password join link").not.toBeNull();
  return match![1].replace(/&#x3D;/g, "=").replace(/&amp;/g, "&");
}

/**
 * Port of the spec-local completeSignup: set a password on the new-user
 * signup screen reached from a join link.
 */
export async function completeSignup(page: Page) {
  await page.getByLabel("Create a password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm your password", { exact: true }).fill(PASSWORD);
  await page
    .getByRole("button", { name: "Save new password", exact: true })
    .click();
}

/** Port of the spec-local enableGoogleSSO(). Requires an admin session. */
export async function enableGoogleSSO(api: MetabaseApi) {
  await api.activateToken("pro-self-hosted");
  await api.put("/api/google/settings", {
    "google-auth-auto-create-accounts-domain": null,
    "google-auth-client-id": "example1.apps.googleusercontent.com",
    "google-auth-enabled": true,
  });
}

/**
 * Revoke a group's access to a collection through the collection graph
 * (the spec's GET /api/collection/graph → PUT round-trip).
 */
export async function revokeCollectionAccess(
  api: MetabaseApi,
  groupId: number,
  collectionId: number,
) {
  const response = await api.get("/api/collection/graph");
  const graph = (await response.json()) as {
    revision: number;
    groups: Record<string, Record<string, string>>;
  };
  await api.put("/api/collection/graph", {
    ...graph,
    groups: {
      ...graph.groups,
      [groupId]: {
        ...graph.groups[groupId],
        [collectionId]: "none",
      },
    },
  });
}
