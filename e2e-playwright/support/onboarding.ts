/**
 * Helpers for the onboarding specs (about, urls, onboarding-checklist).
 * Lives in its own file so the shared support modules stay untouched.
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

/**
 * First/last names from e2e/support/cypress_data.js — that file is untyped
 * JS outside this project's tsconfig include, so the two users the onboarding
 * specs need are inlined here (emails/passwords live in sample-data.ts USERS).
 */
export const USER_NAMES = {
  admin: { first_name: "Bobby", last_name: "Tables" },
  normal: { first_name: "Robert", last_name: "Tableton" },
} as const;

type UserNameParts = { first_name: string; last_name: string };

/**
 * Port of H.getFullName (e2e/support/helpers/e2e-users-helpers.ts), minus the
 * email fallback — names are always present here.
 */
export function getFullName({ first_name, last_name }: UserNameParts): string {
  return `${first_name} ${last_name}`;
}

/** Port of getUsersPersonalCollectionSlug from urls.cy.spec.js. */
export function getUsersPersonalCollectionSlug({
  first_name,
  last_name,
}: UserNameParts): string {
  return `${first_name.toLowerCase()}-${last_name.toLowerCase()}-s-personal-collection`;
}

/**
 * Port of NORMAL_PERSONAL_COLLECTION_ID from
 * e2e/support/cypress_sample_instance_data.js — looked up the same way
 * support/permissions.ts resolves ADMIN_PERSONAL_COLLECTION_ID.
 */
export const NORMAL_PERSONAL_COLLECTION_ID = findCollectionId(
  "Robert Tableton's Personal Collection",
);

function findCollectionId(name: string): number {
  const collection = SAMPLE_INSTANCE_DATA.collections.find(
    (collection) => collection.name === name,
  );
  if (!collection) {
    throw new Error(
      `Collection "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(collection.id);
}

/**
 * Port of cy.location("pathname").should("eq", ...). Cypress retried the
 * location read, so this must poll — a one-shot check catches transient
 * states mid-redirect (PORTING.md wave 5).
 */
export function expectPathname(page: Page, pathname: string) {
  return expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}
