/**
 * Per-spec helpers for the data-model-shared-2 port
 * (e2e/test/scenarios/data-model/data-model-shared-2.cy.spec.ts).
 *
 * The shared surface lives in support/data-model.ts (written for
 * data-model-shared-1) and is imported read-only; this module only adds the
 * `FieldSection` getters that spec never needed, plus the small utilities the
 * shared-2 spec uses. New module per PORTING rule 9 — shared modules are not
 * edited.
 *
 * Port notes:
 * - The Cypress FieldSection getters are transcribed from
 *   e2e/support/helpers/e2e-datamodel-helpers.ts. `findByPlaceholderText` /
 *   `findByLabelText` are EXACT in testing-library, so every getter passes
 *   `{ exact: true }` (PORTING: `getByLabel` is a SUBSTRING match by default,
 *   which would silently loosen these).
 * - `responseCounter` replaces `cy.wait(["@metadata", "@metadata"])`: three
 *   concurrent `waitForResponse`s on one predicate all resolve on the FIRST
 *   hit, so a counter polled to >= n is the faithful port. It also stands in
 *   for the retroactive `cy.wait` semantics (Cypress consumes past responses;
 *   `waitForResponse` does not).
 * - `expectToastsContainText` implements chai-jquery's CONCATENATION semantics
 *   for `cy.get(sel).should("contain.text", …)` on a multi-element subject.
 *   The spec has call sites where an earlier toast is still on screen, so
 *   `expect(undoToast(page)).toContainText(…)` would be a strict-mode
 *   violation, and `.first()` would silently strengthen the assertion.
 */
import type { Locator, Page, Request, Response } from "@playwright/test";

import { FieldSection as SharedFieldSection } from "./data-model";
import type { Area } from "./data-model";
import { expect } from "./fixtures";

/** Port of Shared.getTriggeredFromArea(area). */
export function getTriggeredFromArea(area: Area) {
  return () => (area === "admin" ? "admin" : "data_studio");
}

/**
 * Port of `cy.button(name)` (e2e/support/commands/ui/button.ts):
 * `findByRole("button", { name })` — exact for strings, as testing-library's
 * string matching is exact (PORTING rule 1).
 */
export function button(
  scope: Page | Locator,
  name: string | RegExp,
): Locator {
  return scope.getByRole(
    "button",
    typeof name === "string" ? { name, exact: true } : { name },
  );
}

/**
 * The FieldSection getters this spec needs on top of the shared ones.
 * Spread so call sites keep the single `FieldSection.` namespace the Cypress
 * spec used.
 */
export const FieldSection = {
  ...SharedFieldSection,

  /** getFieldNameInput: findByPlaceholderText("Give this field a name"). */
  getNameInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByPlaceholder("Give this field a name", {
      exact: true,
    }),

  /** getFieldDescriptionInput: placeholder "Give this field a description". */
  getDescriptionInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByPlaceholder(
      "Give this field a description",
      { exact: true },
    ),

  /** getFieldValuesButton: `button(/Field values/)`. */
  getFieldValuesButton: (page: Page): Locator =>
    button(SharedFieldSection.get(page), /Field values/),

  /**
   * getFieldCoercionToggle: findByLabelText("Cast to a specific data type").
   * This resolves to the Mantine Switch's visually-hidden `role="switch"`
   * input; upstream clicks its `.parent()`. PORTING rule 4 — click the input
   * itself with `{ force: true }` (see `clickCoercionToggle`).
   */
  getCoercionToggle: (page: Page): Locator =>
    SharedFieldSection.get(page).getByLabel("Cast to a specific data type", {
      exact: true,
    }),

  /** getFieldCoercionInput: findByPlaceholderText("Select data type"). */
  getCoercionInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByPlaceholder("Select data type", {
      exact: true,
    }),

  /** getFieldSemanticTypeCurrencyInput: placeholder "Select a currency type". */
  getSemanticTypeCurrencyInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByPlaceholder("Select a currency type", {
      exact: true,
    }),

  /** getFieldVisibilityInput: placeholder "Select a field visibility". */
  getVisibilityInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByPlaceholder("Select a field visibility", {
      exact: true,
    }),

  /** getFieldFilteringInput: placeholder "Select field filtering". */
  getFilteringInput: (page: Page): Locator =>
    SharedFieldSection.get(page).getByPlaceholder("Select field filtering", {
      exact: true,
    }),
};

/**
 * Upstream: `FieldSection.getCoercionToggle().parent().click(...)`.
 * The Mantine Switch input is visually hidden behind the track, so a real
 * click needs `{ force: true }` (PORTING rule 4). Cypress clicked the wrapper;
 * a dispatched/forced click on the input runs the same activation behaviour.
 */
export async function clickCoercionToggle(page: Page) {
  await FieldSection.getCoercionToggle(page).click({ force: true });
}

/** Port of the spec-local `clickAway()` — `cy.get("body").click(0, 0)`. */
export async function clickAway(page: Page) {
  await page.locator("body").click({ position: { x: 0, y: 0 } });
}

/**
 * A retroactive response counter. Cypress's `cy.wait("@alias")` consumes
 * responses that already arrived; `page.waitForResponse` does not, and N
 * concurrent waits on one predicate all resolve on the first hit. So the
 * faithful port of `cy.wait(["@metadata", "@metadata"])` is "at least 2
 * matching responses have been seen since the counter was installed".
 */
export type ResponseCounter = {
  get count(): number;
  waitFor(n: number): Promise<void>;
  reset(): void;
};

export function responseCounter(
  page: Page,
  predicate: (response: Response) => boolean,
): ResponseCounter {
  let seen = 0;
  page.on("response", (response) => {
    if (predicate(response)) {
      seen += 1;
    }
  });
  return {
    get count() {
      return seen;
    },
    async waitFor(n: number) {
      await expect.poll(() => seen, { timeout: 30_000 }).toBeGreaterThanOrEqual(n);
    },
    reset() {
      seen = 0;
    },
  };
}

/** GET /api/table/:id/query_metadata — the spec's `@metadata` alias. */
export function queryMetadataCounter(page: Page): ResponseCounter {
  return responseCounter(
    page,
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/table\/\d+\/query_metadata$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/**
 * A passive request recorder — the port of
 * `cy.get("@fieldValues.all").should("have.length", 0)` ("this request never
 * fired"). Install before the navigation under test.
 */
export function requestRecorder(
  page: Page,
  predicate: (request: Request) => boolean,
): { urls: string[] } {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (predicate(request)) {
      urls.push(request.url());
    }
  });
  return { urls };
}

/** GET /api/field/:id/values — the spec's `@fieldValues` alias. */
export function fieldValuesRecorder(page: Page): { urls: string[] } {
  return requestRecorder(
    page,
    (request) =>
      request.method() === "GET" &&
      /^\/api\/field\/\d+\/values$/.test(new URL(request.url()).pathname),
  );
}

/**
 * `cy.get("[data-testid=toast-undo]").should("contain.text", msg)` on a
 * MULTI-element subject is a CONCATENATION in chai-jquery, not an any-of — so
 * porting it with `.first()` would silently strengthen it. Join every toast's
 * text and poll, which is exactly what upstream asserts.
 */
export async function expectToastsContainText(page: Page, message: string) {
  await expect
    .poll(
      async () =>
        (await page.getByTestId("toast-undo").allTextContents()).join(""),
      { timeout: 15_000 },
    )
    .toContain(message);
}

/**
 * Spec-local `verifyAndCloseToast`, replacing the shared one for this spec.
 *
 * The shared `data-model.ts` version does
 * `expect(undoToast(page)).toContainText(msg)`, which is a STRICT-MODE
 * VIOLATION whenever a previous toast is still exiting — measured on
 * "should allow to enable, change, and disable coercion strategy", where the
 * "Casting updated" toast is still in the DOM when "Casting disabled" arrives.
 *
 * Upstream is `undoToast().should("contain.text", msg)` on a multi-element
 * subject, which chai-jquery evaluates as a CONCATENATION — so it passes there.
 * (Its follow-up `undoToast().icon("close").click()` would have errored on two
 * elements, so Cypress's slower pacing must always leave exactly one; that is a
 * pacing accident, not an assertion.) This port keeps the concatenation
 * semantics for the assertion and closes the toast that actually carries the
 * message.
 */
export async function verifyAndCloseToast(page: Page, message: string) {
  await expectToastsContainText(page, message);
  const toast = page
    .getByTestId("toast-undo")
    .filter({ hasText: message })
    .first();
  // dispatchEvent, not click({force:true}): a forced click moves the real
  // mouse and hits whatever is topmost at that point (PORTING).
  await toast.locator(".Icon-close").dispatchEvent("click");
  await expect(toast).toHaveCount(0);
}

/**
 * Port of `cy.get(el).scrollTo("top" | "bottom")` — Cypress sets `scrollTop`
 * on the subject via jQuery (plain JS, no smooth behaviour), so assign it
 * directly. (PORTING: a `scrollTo({behavior:"smooth"})` port would be dropped
 * entirely under the harness's `reducedMotion: "reduce"`.)
 */
export async function scrollElementTo(
  locator: Locator,
  position: "top" | "bottom",
) {
  await locator.evaluate((element, where) => {
    element.scrollTop = where === "top" ? 0 : element.scrollHeight;
  }, position);
}

/** `getBoundingClientRect()` read inside the browser — `boundingBox()` is a
 * second round trip that returns null if the element re-rendered. */
export function clientRect(locator: Locator): Promise<DOMRect> {
  return locator.evaluate(
    (element) => element.getBoundingClientRect().toJSON() as DOMRect,
  );
}

/** Computed `background-color` of a single element. */
export function backgroundColor(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
}
