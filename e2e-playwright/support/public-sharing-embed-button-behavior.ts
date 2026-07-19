/**
 * Helpers for the public-sharing embed-button-behavior spec port
 * (e2e/test/scenarios/sharing/public-sharing-embed-button-behavior.cy.spec.js) —
 * the "Embed" / sharing-button behaviour on questions and dashboards: enabled /
 * disabled per public-sharing + embedding settings, admin vs non-admin, and the
 * legacy static-embedding modal.
 *
 * NEW helpers live here (parallel-agent rule: no edits to shared modules). The
 * sharing-menu, embed-modal, factory, api, ui and notebook helpers are IMPORTED
 * read-only from the shared modules.
 *
 * Snowplow: the upstream `beforeEach`/`afterEach` call H.resetSnowplow /
 * H.enableTracking / H.expectNoBadSnowplowEvents and the "snowplow events"
 * describes assert H.expectUnstructuredSnowplowEvent. Per PORTING rule 6 these
 * become no-op stubs (the spike stubs snowplow) — kept as callable functions so
 * the spec's structure mirrors the original and the real UI flows (opening the
 * modal, clicking copy/publish/unpublish) still execute.
 */
import type { Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createDashboard, createNativeQuestion } from "./factories";
import { sharingMenu, sharingMenuButton, openSharingMenu } from "./sharing";
import { visitDashboard, visitQuestion } from "./ui";
import { createPublicQuestionLink } from "./sharing";
import { createPublicDashboardLink } from "./visualizer-basics";

// === snowplow no-op stubs (PORTING rule 6) ===

export const resetSnowplow = async () => {};
export const enableTracking = async () => {};
export const expectNoBadSnowplowEvents = async () => {};
export const expectUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
) => {};

export type Resource = "question" | "dashboard";

// === resource factories (ports of the spec's createResource) ===

/**
 * Port of the spec-local `createResource`. Question: a native PRODUCTS query
 * with date/price/category template tags. Dashboard: three parameters
 * (Created At / Price / Category). Returns the created id.
 */
export async function createResource(
  api: MetabaseApi,
  resource: Resource,
): Promise<number> {
  if (resource === "question") {
    const card = await createNativeQuestion(api, {
      name: "Question",
      native: {
        query: `
          SELECT *
          FROM PRODUCTS
          WHERE true
            [[AND created_at > {{created_at}}]]
            [[AND price > {{price}}]]
            [[AND category = {{category}}]]`,
        "template-tags": {
          date: {
            type: "date",
            name: "created_at",
            id: "b2517f32-d2e2-4f42-ab79-c91e07e820a0",
            "display-name": "Created At",
          },
          price: {
            type: "number",
            name: "price",
            id: "879d1597-e673-414c-a96f-ff5887359834",
            "display-name": "Price",
          },
          category: {
            type: "text",
            name: "category",
            id: "1f741a9a-a95e-4ac6-b584-5101e7cf77e1",
            "display-name": "Category",
          },
        },
      },
      limit: 10,
    });
    return card.id;
  }

  const dashboard = await createDashboard(api, {
    name: "Dashboard",
    parameters: [
      { id: "1", name: "Created At", slug: "created_at", type: "date/month-year" },
      { id: "2", name: "Price", slug: "price", type: "number/=" },
      { id: "3", name: "Category", slug: "category", type: "string/contains" },
    ],
  });
  return dashboard.id;
}

/** Port of the spec-local `createPublicResourceLink`. */
export async function createPublicResourceLink(
  api: MetabaseApi,
  resource: Resource,
  id: number,
): Promise<void> {
  if (resource === "question") {
    await createPublicQuestionLink(api, id);
  } else {
    await createPublicDashboardLink(api, id);
  }
}

/** Port of the spec-local `visitResource`. */
export async function visitResource(
  page: Page,
  api: MetabaseApi,
  resource: Resource,
  id: number,
): Promise<void> {
  if (resource === "question") {
    await visitQuestion(page, id);
  } else {
    await visitDashboard(page, api, id);
  }
}

// === assertion helpers (ports of the spec-local assertions) ===

/** Port of the spec-local `assertNonAdminCannotCreatePublicLink`. */
export async function assertNonAdminCannotCreatePublicLink(
  page: Page,
  resource: Resource,
): Promise<void> {
  if (resource === "question") {
    // No public link: the share button copies the app link directly, no menu.
    await expect(sharingMenuButton(page)).toHaveAttribute(
      "aria-label",
      "Copy link",
    );
    return;
  }

  // No public link: dashboards keep the app link copy and the PDF export.
  await openSharingMenu(page);
  const menu = sharingMenu(page);
  await expect(menu.getByText("Copy link", { exact: true })).toBeVisible();
  await expect(menu.getByText("Export as PDF", { exact: true })).toBeVisible();
  await expect(menu.getByText("Embed", { exact: true })).toHaveCount(0);
  await expect(menu.getByText(/public link/i)).toHaveCount(0);
}

/** Port of the spec-local `assertValidPublicLink`. */
export async function assertValidPublicLink(
  page: Page,
  { resource, shouldHaveRemoveLink }: {
    resource: Resource;
    shouldHaveRemoveLink: boolean;
  },
): Promise<void> {
  const regex = new RegExp(
    `https?:\\/\\/[^\\/]+\\/public\\/${resource}\\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(\\.csv|\\.json|\\.xlsx)?`,
  );

  const content = page.getByTestId("public-link-popover-content");
  await expect(content.getByText("Public link", { exact: true })).toBeVisible();

  const input = content.getByTestId("public-link-input");
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(regex);

  const removeLink = content.getByText("Remove public link", { exact: true });
  if (shouldHaveRemoveLink) {
    await expect(removeLink).toBeVisible();
  } else {
    await expect(removeLink).toHaveCount(0);
  }
}

// === publish / unpublish with request AND response bodies ===

type PublishBodies = {
  request: Record<string, unknown> | null;
  response: Record<string, unknown>;
};

async function bodiesFrom(response: Response): Promise<PublishBodies> {
  return {
    request: response.request().postDataJSON() as Record<string, unknown> | null,
    response: (await response.json()) as Record<string, unknown>,
  };
}

/**
 * Port of H.publishChanges (e2e-embedding-helpers.js). Upstream waits for TWO
 * PUTs and picks the one whose body carries `embedding_params`; a waitForResponse
 * gated on that key resolves on exactly that request. Unlike the shared
 * embedding-dashboard.publishChanges (request body only) this also surfaces the
 * response body, which the "set a proper embedding_type" test asserts.
 */
export async function publishChanges(
  page: Page,
  apiPath: "card" | "dashboard",
  callback?: (bodies: PublishBodies) => void,
): Promise<void> {
  const published = page.waitForResponse((response) => {
    if (response.request().method() !== "PUT") {
      return false;
    }
    if (
      !new RegExp(`^/api/${apiPath}/\\d+$`).test(new URL(response.url()).pathname)
    ) {
      return false;
    }
    const body = response.request().postDataJSON() as Record<
      string,
      unknown
    > | null;
    return body != null && "embedding_params" in body;
  });

  await page
    .getByRole("button", { name: /^(Publish|Publish changes)$/ })
    .click();

  const response = await published;
  callback?.(await bodiesFrom(response));
}

/** Port of H.unpublishChanges: the PUT whose body flips `enable_embedding` off. */
export async function unpublishChanges(
  page: Page,
  apiPath: "card" | "dashboard",
  callback?: (bodies: PublishBodies) => void,
): Promise<void> {
  const unpublished = page.waitForResponse((response) => {
    if (response.request().method() !== "PUT") {
      return false;
    }
    if (
      !new RegExp(`^/api/${apiPath}/\\d+$`).test(new URL(response.url()).pathname)
    ) {
      return false;
    }
    return (
      (response.request().postDataJSON() as Record<string, unknown> | null)
        ?.enable_embedding === false
    );
  });

  await page.getByRole("button", { name: "Unpublish", exact: true }).click();

  const response = await unpublished;
  callback?.(await bodiesFrom(response));
}
