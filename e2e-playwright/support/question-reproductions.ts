/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/question-reproductions/reproductions.cy.spec.ts.
 *
 * Lives in its own module so the shared support files stay untouched
 * (PORTING.md rule 9). Everything else the port needs is imported read-only
 * from the existing shared modules.
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { popover } from "./ui";

export const QA_DB_SKIP_REASON =
  "Requires the QA Postgres containers and their postgres-12 / postgres-writable snapshots (set PW_QA_DB_ENABLED)";

export const MONGO_SKIP_REASON =
  "Requires the mongo QA database and its mongo-5 snapshot (set PW_QA_DB_ENABLED)";

// === response waits (the spec's cy.intercept + cy.wait aliases) ===

/** POST /api/dataset — the "@dataset" alias. */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** PUT /api/card/:id — the "@updateCard" alias. */
export function waitForUpdateCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
}

/** POST /api/card — the "@cardCreate" alias. */
export function waitForCreateCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

// === small ports of `H` helpers with no shared-module home yet ===

/**
 * Port of createMockParameter (metabase-types/api/mocks/parameters.ts). The
 * shared `mockParameter` in dashboard-parameters.ts has a closed field list;
 * this spec passes `required` and `target` too.
 */
export function createMockParameter(
  opts: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id: "1", name: "text", type: "string/=", slug: "text", ...opts };
}

/** Port of H.updateSetting (api/updateSetting.ts): PUT /api/setting/:key. */
export async function updateSetting(
  api: MetabaseApi,
  setting: string,
  value: unknown,
) {
  await api.put(`/api/setting/${encodeURIComponent(setting)}`, { value });
}

/** Port of H.runButtonOverlay (e2e-misc-helpers.js). */
export function runButtonOverlay(page: Page): Locator {
  return page.getByTestId("run-button-overlay");
}

/** Port of H.sidebar (e2e-ui-elements-helpers.js) — `cy.get("main aside")`. */
export function mainAside(page: Page): Locator {
  return page.locator("main aside");
}

/** Port of H.miniPickerOurAnalytics (e2e-ui-elements-helpers.js). */
export function miniPickerOurAnalytics(page: Page): Locator {
  return page.getByTestId("mini-picker").getByText("Our analytics", {
    exact: true,
  });
}

/**
 * Port of H.ensureParameterColumnValue (e2e-ui-elements-helpers.js): EVERY
 * cell of the named column must read `columnValue`. The Cypress version is a
 * `.should(callback)`, which retries, so the whole check is wrapped in toPass.
 * `cy.get()` inside `.within()` also carries an implicit existence
 * requirement, hence the explicit non-empty assertion.
 */
export async function ensureParameterColumnValue(
  page: Page,
  { columnName, columnValue }: { columnName: string; columnValue: string },
) {
  const cells = page
    .getByTestId("table-body")
    .locator(`[data-column-id="${columnName}"]`);
  await expect(async () => {
    const texts = await cells.allTextContents();
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).toBe(columnValue);
    }
  }).toPass();
}

/**
 * `cy.findByDisplayValue(value).should("not.exist")` scoped to a container,
 * as a COUNT. Playwright 1.61.1's types are missing `getByDisplayValue`, so
 * the scan is imperative; `select` and `textarea` are included because
 * testing-library's query covers them (Metabase's EditableText titles are
 * textareas).
 *
 * The scan is a single atomic DOM read, and must stay one. An imperative
 * `count()` + `nth(i).inputValue()` loop is one round trip per control, so
 * against a subtree that is unmounting `count()` can observe the container and
 * the following `inputValue()` then hangs for the full actionability timeout
 * on a node that has since been removed. `evaluateAll` does not auto-wait and
 * samples every control in one pass; a scope that has already unmounted yields
 * zero nodes, i.e. 0 — the same outcome Cypress gives when
 * `findByDisplayValue` finds nothing.
 *
 * Note the corollary: because this is a snapshot, it only means anything if
 * the container is known to be mounted when it runs. It is NOT a way to catch
 * a transient state on a closing dialog — see issue 55631 in the spec, which
 * needs a page-side poll installed before the action instead.
 */
export async function countDisplayValue(
  scope: Locator,
  value: string,
): Promise<number> {
  return scope
    .locator("input, textarea, select")
    .evaluateAll(
      (controls, target) =>
        controls.filter(
          (control) =>
            (
              control as
                | HTMLInputElement
                | HTMLTextAreaElement
                | HTMLSelectElement
            ).value === target,
        ).length,
      value,
    );
}

/** Retrying variant of the above, for the steady-state title lookups. */
export async function findByDisplayValue(
  scope: Locator,
  value: string,
): Promise<Locator> {
  const controls = scope.locator("input, textarea, select");
  let match: Locator | null = null;
  await expect(async () => {
    match = null;
    const count = await controls.count();
    for (let index = 0; index < count; index++) {
      const control = controls.nth(index);
      if ((await control.inputValue()) === value) {
        match = control;
        return;
      }
    }
    throw new Error(`No control with display value ${JSON.stringify(value)}`);
  }).toPass();
  if (!match) {
    throw new Error(`No control with display value ${JSON.stringify(value)}`);
  }
  return match;
}

/**
 * Cypress's `should("not.be.visible")` requires the element to EXIST and be
 * invisible, and its rule set is much wider than Playwright's `toBeHidden`
 * (which only looks at the box, `display` and `visibility`). Reimplemented
 * from `cypress/packages/driver/src/dom/visibility.ts`:
 *
 *  1. `display: none`, `visibility: hidden|collapse`, or `opacity: 0` on the
 *     element or ANY ancestor.
 *  2. Zero `offsetWidth`/`offsetHeight`.
 *  3. Then the branch that matters here — **if the element or an ancestor is
 *     `position: fixed` or `sticky`, Cypress does NOT do the ancestor-overflow
 *     bounds check; it does an OCCLUSION check** (`elIsNotElementFromPoint`):
 *     the element is hidden when `document.elementFromPoint` at its centre is
 *     not itself or one of its descendants.
 *  4. Otherwise: clipped entirely outside an `overflow: hidden|scroll|auto`
 *     ancestor's box.
 *
 * Rule 3 is the whole point of issue #67903 ("should not show preview table
 * headers ON TOP OF other elements"): `table-header` is `position: sticky`, it
 * sits in the layout at a perfectly visible rect, and what the test checks is
 * that the SQL sidebar is painted over it. Measured on this jar: the element
 * at the header's centre (and at all four corners) is `DIV.cm-line`, the
 * sidebar's CodeMirror. A `toBeHidden`-shaped port would fail on a correct app.
 */
export async function expectCypressHidden(locator: Locator) {
  await expect(locator).toBeAttached();
  await expect
    .poll(() =>
      locator.evaluate((el: HTMLElement) => {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) {
          return true;
        }

        let fixedOrSticky = false;
        for (
          let node: HTMLElement | null = el;
          node;
          node = node.parentElement
        ) {
          const style = getComputedStyle(node);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number(style.opacity) === 0
          ) {
            return true;
          }
          if (style.position === "fixed" || style.position === "sticky") {
            fixedOrSticky = true;
          }
        }

        const rect = el.getBoundingClientRect();

        if (fixedOrSticky) {
          const at = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return !(at != null && (at === el || el.contains(at)));
        }

        for (
          let node: HTMLElement | null = el.parentElement;
          node;
          node = node.parentElement
        ) {
          const style = getComputedStyle(node);
          if (
            !/hidden|scroll|auto/.test(
              `${style.overflow} ${style.overflowX} ${style.overflowY}`,
            )
          ) {
            continue;
          }
          const box = node.getBoundingClientRect();
          if (
            rect.bottom <= box.top ||
            rect.top >= box.bottom ||
            rect.right <= box.left ||
            rect.left >= box.right
          ) {
            return true;
          }
        }
        return false;
      }),
    )
    .toBe(true);
}

/**
 * Re-resolve a QA-DB table + field id until the field the test needs actually
 * exists.
 *
 * Why this is not over-engineering: the `postgres-writable` snapshot's APP DB
 * already carries a `products` table row for database 2 with
 * `initial_sync_status: "complete"` (measured: table 199, from the sample data
 * that lived in `writable_db` when the snapshot was generated). So
 * `resyncDatabase({ tables: ["products"] })` — and the Cypress
 * `waitForSyncToFinish` it ports, which gates on exactly the same condition —
 * is satisfied INSTANTLY by the stale row, before the sync has re-read the
 * table we just dropped and recreated. The lookup then reads the old column
 * set and `name` is missing. Same family as the `resyncDatabase({ dbId })`
 * hole in PORTING.md, but triggered by a stale *complete* row rather than a
 * missing `tables` argument; Cypress's command-queue pacing hides it upstream.
 */
export async function getSyncedFieldId(
  api: MetabaseApi,
  {
    resolveTableId,
    name,
  }: { resolveTableId: () => Promise<number>; name: string },
): Promise<{ tableId: number; fieldId: number }> {
  let resolved: { tableId: number; fieldId: number } | null = null;
  await expect(async () => {
    const tableId = await resolveTableId();
    const body = (await (
      await api.get(`/api/table/${tableId}/query_metadata`)
    ).json()) as { fields?: { id: number; name: string }[] };
    const field = (body.fields ?? []).find((field) => field.name === name);
    if (!field) {
      throw new Error(
        `Field ${name} not synced yet on table ${tableId} (have: ${(
          body.fields ?? []
        )
          .map((f) => f.name)
          .join(", ")})`,
      );
    }
    resolved = { tableId, fieldId: field.id };
  }).toPass({ timeout: 60_000 });
  if (!resolved) {
    throw new Error(`Field ${name} never synced`);
  }
  return resolved;
}

// === issue 39487: date-picker layout measurements ===

/**
 * `nextButton()` / `previousButton()` upstream are
 * `H.popover().get("button[data-direction=next]")`. **`cy.get()` RESETS the
 * subject** (PORTING), so the `H.popover()` prefix is dead code and what
 * actually executes is a page-wide `cy.get`. Ported as what executes.
 *
 * (`[data-direction=next]` is also invalid CSS for `querySelectorAll` —
 * Sizzle accepts the unquoted value, so the attribute value is quoted here.)
 */
export function datePickerNextButton(page: Page): Locator {
  return page.locator('button[data-direction="next"]');
}

export function datePickerPreviousButton(page: Page): Locator {
  return page.locator('button[data-direction="previous"]');
}

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * `boundingBox()` is a second round trip that returns null on a re-render, so
 * the rect is read inside the evaluate (PORTING).
 */
function rectOf(locator: Locator): Promise<Rect> {
  return locator.first().evaluate((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      left: r.left,
    };
  });
}

export type LayoutBaseline = {
  pickerHeight: number;
  nextRect: Rect;
  previousRect: Rect;
};

/**
 * Port of the spec-local measureInitialValues. `H.popover().then(([$el]) =>
 * …)` destructures the FIRST element of the popover SET (PORTING), so the
 * picker height is the first visible popover's.
 */
export async function measureInitialValues(
  page: Page,
): Promise<LayoutBaseline> {
  const picker = await rectOf(popover(page).first());
  return {
    pickerHeight: picker.height,
    nextRect: await rectOf(datePickerNextButton(page)),
    previousRect: await rectOf(datePickerPreviousButton(page)),
  };
}

/**
 * Port of the spec-local assertNoLayoutShift.
 *
 * ⚠️ STRENGTHENED, deliberately, and this is a finding rather than a porting
 * choice: upstream's two rect assertions are
 * `expect(rect).to.deep.eq(previousButtonRect)` on two **DOMRect** objects.
 * DOMRect exposes x/y/width/height/top/right/bottom/left as accessors on the
 * PROTOTYPE, so `Object.keys(rect)` is `[]` and DOMRect is not iterable —
 * deep-eql's `objectEqual` returns `true` when both sides have no enumerable
 * keys and no iterator entries. Verified against the repo's deep-eql (5.0.2)
 * with a prototype-getter stand-in: two objects whose getters return 1 and 999
 * compare **deep-equal**. So upstream's previous/next rect checks can never
 * fail; only the `expect(height).to.eq(initialPickerHeight)` check is
 * load-bearing there. Ported as a real field-by-field comparison so the
 * assertions mean what they were written to mean.
 */
export async function assertNoLayoutShift(
  page: Page,
  baseline: LayoutBaseline,
) {
  // assertDatetimeFilterPickerHeightDidNotChange (load-bearing upstream)
  const picker = await rectOf(popover(page).first());
  expect(picker.height).toBe(baseline.pickerHeight);

  // assertPreviousButtonRectDidNotChange / assertNextButtonRectDidNotChange
  expect(await rectOf(datePickerPreviousButton(page))).toEqual(
    baseline.previousRect,
  );
  expect(await rectOf(datePickerNextButton(page))).toEqual(baseline.nextRect);
}

/** Port of the spec-local checkSingleDateFilter (4 "next" clicks). */
export async function checkSingleDateFilter(page: Page) {
  const baseline = await measureInitialValues(page);
  for (let click = 0; click < 4; click++) {
    await datePickerNextButton(page).click();
    await assertNoLayoutShift(page, baseline);
  }
}

/** Port of the spec-local checkDateRangeFilter (1 "next" click). */
export async function checkDateRangeFilter(page: Page) {
  const baseline = await measureInitialValues(page);
  await datePickerNextButton(page).click();
  await assertNoLayoutShift(page, baseline);
}

/**
 * `cy.clear().type(text)` on a text input: Cypress's `type` clicks the subject
 * first, and `clear` is select-all + delete.
 */
export async function clearAndType(input: Locator, text: string) {
  await input.click();
  await input.page().keyboard.press("ControlOrMeta+A");
  await input.page().keyboard.press("Backspace");
  await input.page().keyboard.type(text);
}
