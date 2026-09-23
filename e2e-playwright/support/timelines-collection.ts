/**
 * Helpers for the timelines-collection spec port
 * (e2e/test/scenarios/organization/timelines-collection.cy.spec.js).
 *
 * New module per the parallel-agent rule — the shared timeline helpers
 * (createTimeline / createTimelineWithEvents / timelineCardHeader / …) are
 * imported READ-ONLY from support/timelines.ts; only the two spec-local
 * helpers that had no shared home live here.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";

/**
 * Port of the spec-local openMenu:
 *   cy.findByText(name).parent().parent().icon("ellipsis").click()
 * The ellipsis lives two ancestors up from the name label (an event card or a
 * timeline card). The action icon is hover-gated, so hover the card first.
 */
export async function openMenu(page: Page, name: string): Promise<void> {
  const card = page.getByText(name, { exact: true }).locator("xpath=../..");
  await card.hover();
  await card.locator(".Icon-ellipsis").click();
}

/**
 * Port of the spec-local setFormattingSettings:
 *   cy.request("PUT", "api/setting/custom-formatting", { value: settings })
 */
export async function setFormattingSettings(
  api: MetabaseApi,
  settings: unknown,
): Promise<void> {
  await api.updateSetting("custom-formatting", settings);
}

/** POST /api/timeline-event (@createEvent). */
export function waitForCreateEvent(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/timeline-event" &&
      response.request().method() === "POST",
  );
}

/** PUT /api/timeline-event/** (@updateEvent). */
export function waitForUpdateEvent(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      /^\/api\/timeline-event\/\d+/.test(new URL(response.url()).pathname) &&
      response.request().method() === "PUT",
  );
}

/** DELETE /api/timeline-event/** (@deleteEvent). */
export function waitForDeleteEvent(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      /^\/api\/timeline-event\/\d+/.test(new URL(response.url()).pathname) &&
      response.request().method() === "DELETE",
  );
}

/** POST /api/timeline (@createTimeline). */
export function waitForCreateTimeline(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/timeline" &&
      response.request().method() === "POST",
  );
}

/** PUT /api/timeline/** (@updateTimeline). */
export function waitForUpdateTimeline(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      /^\/api\/timeline\/\d+/.test(new URL(response.url()).pathname) &&
      response.request().method() === "PUT",
  );
}

/** DELETE /api/timeline/** (@deleteTimeline). */
export function waitForDeleteTimeline(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      /^\/api\/timeline\/\d+/.test(new URL(response.url()).pathname) &&
      response.request().method() === "DELETE",
  );
}

/** PUT /api/collection/** (@updateCollection). */
export function waitForUpdateCollection(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      /^\/api\/collection\/\d+/.test(new URL(response.url()).pathname) &&
      response.request().method() === "PUT",
  );
}

/** GET /api/timeline/** (@getTimeline). */
export function waitForGetTimeline(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      /^\/api\/timeline\/\d+/.test(new URL(response.url()).pathname) &&
      response.request().method() === "GET",
  );
}
