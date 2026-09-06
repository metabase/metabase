/**
 * Helpers for the sql-filters-reset-clear spec port
 * (native-filters/sql-filters-reset-clear.cy.spec.ts).
 *
 * Mirrors the Cypress original's module-level flows: each `it` builds a native
 * question with four template tags (no-default/default × non-required/required)
 * and delegates to one of the check* flows, passing type-specific set/update
 * callbacks. The callbacks take `page` (input variant also takes the widget
 * scope, because in the parameter sidebar the input is scoped to a section) —
 * the Cypress `cy`/`H` globals have no equivalent.
 *
 * DOM notes:
 * - `filter(label)` is the ParameterValueWidgetTrigger Box, whose accessible
 *   name is the parameter display-name (main bar) or the "Default filter widget
 *   value[ (required)]" label (sidebar). Ported as getByLabel(exact) — matches
 *   the dashboard-filters-reset-clear precedent.
 * - The status icons/buttons (WidgetStatus) render INSIDE the trigger, but the
 *   Cypress helpers reach them via `filter(label).parent().icon(...)`. Since
 *   Cypress `.parent().find()` searches all descendants of the parent (which
 *   include the trigger's own children), `.locator("..").locator(".Icon-*")` is
 *   the faithful equivalent and resolves the same node.
 * - Text/number widgets are inline TextWidget `<input type="text">` (role
 *   textbox); date/field widgets are popover-based (textbox / combobox inside
 *   H.popover()).
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { icon, popover } from "./ui";

export type SectionId =
  | "no_default_non_required"
  | "no_default_required"
  | "default_non_required"
  | "default_required";

type Scope = Page | Locator;

export const NO_DEFAULT_NON_REQUIRED = "no default value, non-required";
// unlike a required dashboard filter, a required native filter doesn't need a default
export const NO_DEFAULT_REQUIRED = "no default value, required";
export const DEFAULT_NON_REQUIRED = "default value, non-required";
export const DEFAULT_REQUIRED = "default value, required";

// === value-setter callback types ===

/** Input variant: `(scope, label, value)` — scope is `page` (main bar) or the
 * sidebar section locator. */
export type InputSetter = (
  scope: Scope,
  label: string,
  value: string,
) => Promise<void>;

/** Dropdown variant: `(page, value)` — the popover is a page-level portal. */
export type DropdownSetter = (page: Page, value: string) => Promise<void>;

// === locators (ports of the spec-local filter/*Icon/*Button helpers) ===

/** Port of the spec-local filter(label): cy.findByLabelText(label) (exact). */
export function filter(scope: Scope, label: string): Locator {
  return scope.getByLabel(label, { exact: true });
}

/** Port of the spec-local filterInput(label): filter(label).findByRole("textbox"). */
export function filterInput(scope: Scope, label: string): Locator {
  return filter(scope, label).getByRole("textbox");
}

/** Port of the spec-local filterSection(id): the tag-editor variable settings block. */
export function filterSection(page: Page, id: SectionId): Locator {
  return page.getByTestId(`tag-editor-variable-${id}`);
}

/** Port of clearIcon(label): filter(label).parent().icon("close"). */
function clearIcon(scope: Scope, label: string): Locator {
  return icon(filter(scope, label).locator(".."), "close");
}

/** Port of resetIcon(label): filter(label).parent().icon("revert"). */
function resetIcon(scope: Scope, label: string): Locator {
  return icon(filter(scope, label).locator(".."), "revert");
}

/** Port of chevronIcon(label): filter(label).parent().icon("chevrondown"). */
function chevronIcon(scope: Scope, label: string): Locator {
  return icon(filter(scope, label).locator(".."), "chevrondown");
}

/** Port of clearButton(label): filter(label).parent().findByLabelText("Clear"). */
export function clearButton(scope: Scope, label: string): Locator {
  return filter(scope, label)
    .locator("..")
    .getByLabel("Clear", { exact: true });
}

/** Port of resetButton(label): the "Reset filter to default state" button. */
export function resetButton(scope: Scope, label: string): Locator {
  return filter(scope, label)
    .locator("..")
    .getByLabel("Reset filter to default state", { exact: true });
}

/**
 * Port of the spec-local checkStatusIcon: exactly one of the three status icons
 * is visible (or none). `should("be.visible")` → toBeVisible;
 * `should("not.exist")` → toHaveCount(0).
 */
export async function checkStatusIcon(
  scope: Scope,
  label: string,
  status: "chevron" | "reset" | "clear" | "none",
) {
  const clear = clearIcon(scope, label);
  const reset = resetIcon(scope, label);
  const chevron = chevronIcon(scope, label);

  if (status === "clear") {
    await expect(clear).toBeVisible();
  } else {
    await expect(clear).toHaveCount(0);
  }

  if (status === "reset") {
    await expect(reset).toBeVisible();
  } else {
    await expect(reset).toHaveCount(0);
  }

  if (status === "chevron") {
    await expect(chevron).toBeVisible();
  } else {
    await expect(chevron).toHaveCount(0);
  }
}

// === typing helpers ===

/**
 * Interpret a Cypress `.type()` sequence with `{backspace}` tokens into real
 * keystrokes. Anchor the caret at the end first (Cypress focuses with the caret
 * at the END; Playwright's press/pressSequentially at the START), so a leading
 * `{backspace}` deletes the last existing token/char rather than a no-op at
 * position 0. On an already-empty input the End+Backspace pair is harmless.
 */
async function typeSequence(locator: Locator, text: string) {
  await locator.press("End");
  const parts = text.split(/(\{backspace\})/).filter(Boolean);
  for (const part of parts) {
    if (part === "{backspace}") {
      await locator.press("Backspace");
    } else {
      await locator.pressSequentially(part);
    }
  }
}

/**
 * Port of the input setValue/updateValue callbacks:
 * `filterInput(label).focus().clear().type(value).blur()`.
 *
 * Resolve the input to a single ElementHandle up front and drive every step
 * through it. In the sidebar's required section the widget's accessible name
 * drops the "(required)" suffix the moment a value is entered — a label-based
 * locator would go stale mid-sequence (Cypress resolves the DOM node once and
 * never re-queries by label). The handle points at the same node throughout.
 */
export const setInputValue: InputSetter = async (scope, label, value) => {
  const input = filterInput(scope, label);
  await input.click();
  const handle = await input.elementHandle();
  if (!handle) {
    throw new Error(`filter input not found for label "${label}"`);
  }
  // clear (select-all + delete, like cy.clear()'s real keystrokes)
  await handle.press("ControlOrMeta+a");
  await handle.press("Delete");
  // type, interpreting {backspace} tokens; caret anchored at the end first
  await handle.press("End");
  for (const part of value.split(/(\{backspace\})/).filter(Boolean)) {
    if (part === "{backspace}") {
      await handle.press("Backspace");
    } else {
      await handle.type(part, { delay: 10 });
    }
  }
  await handle.evaluate((el) => (el as HTMLElement).blur());
  await handle.dispose();
};

/**
 * Port of the field (combobox) setValue/updateValue: clear + type into the
 * popover combobox, blur, then click the given commit button. The `{backspace}`
 * in the values removes the pre-existing token before typing the new one.
 */
async function setComboboxValue(
  page: Page,
  value: string,
  buttonName: string,
) {
  const combo = popover(page).getByRole("combobox");
  await combo.click();
  await combo.clear();
  await typeSequence(combo, value);
  await combo.blur();
  await popover(page)
    .getByRole("button", { name: buttonName, exact: true })
    .click();
}

export const setDropdownFieldValue: DropdownSetter = (page, value) =>
  setComboboxValue(page, value, "Add filter");

export const updateDropdownFieldValue: DropdownSetter = (page, value) =>
  setComboboxValue(page, value, "Update filter");

/** Port of the spec-local addDateFilter. */
export async function addDateFilter(page: Page, value: string) {
  const textbox = popover(page).getByRole("textbox");
  await textbox.clear();
  await textbox.pressSequentially(value);
  await textbox.blur();
  await popover(page)
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
}

/** Port of the spec-local updateDateFilter. */
export async function updateDateFilter(page: Page, value: string) {
  const textbox = popover(page).getByRole("textbox");
  await textbox.clear();
  await textbox.pressSequentially(value);
  await textbox.blur();
  await popover(page)
    .getByRole("button", { name: /(Add|Update) filter/ })
    .click();
}

/** Port of `cy.findByTestId("visibility-toggler").click(); cy.icon("variable").click()`. */
async function openParameterSidebar(page: Page) {
  await page.getByTestId("visibility-toggler").click();
  await icon(page, "variable").click();
}

// === check flows ===

/** Port of checkNativeParametersInput (text/number widgets in the parameters bar). */
export async function checkNativeParametersInput(
  page: Page,
  {
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue = setValue,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
    setValue: InputSetter;
    updateValue?: InputSetter;
  },
) {
  // no default value, non-required, no current value
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "none");

  // no default value, non-required, has current value
  await setValue(page, NO_DEFAULT_NON_REQUIRED, otherValue);
  await expect(filterInput(page, NO_DEFAULT_NON_REQUIRED)).toHaveValue(
    otherValueFormatted,
  );
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "clear");
  await clearButton(page, NO_DEFAULT_NON_REQUIRED).click();
  await expect(filterInput(page, NO_DEFAULT_NON_REQUIRED)).toHaveValue("");
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "none");

  // no default value, required, no current value
  await checkStatusIcon(page, NO_DEFAULT_REQUIRED, "none");

  // no default value, required, has current value
  await updateValue(page, NO_DEFAULT_REQUIRED, otherValue);
  await expect(filterInput(page, NO_DEFAULT_REQUIRED)).toHaveValue(
    otherValueFormatted,
  );
  await checkStatusIcon(page, NO_DEFAULT_REQUIRED, "clear");

  // has default value, non-required, current value same as default
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");
  await expect(filterInput(page, DEFAULT_NON_REQUIRED)).toHaveValue(
    defaultValueFormatted,
  );
  await clearButton(page, DEFAULT_NON_REQUIRED).click();
  await expect(filterInput(page, DEFAULT_NON_REQUIRED)).toHaveValue("");

  // has default value, non-required, no current value
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "reset");
  await resetButton(page, DEFAULT_NON_REQUIRED).click();
  await expect(filterInput(page, DEFAULT_NON_REQUIRED)).toHaveValue(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");

  // has default value, non-required, current value different than default
  await updateValue(page, DEFAULT_NON_REQUIRED, otherValue);
  await expect(filterInput(page, DEFAULT_NON_REQUIRED)).toHaveValue(
    otherValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "reset");
  await resetButton(page, DEFAULT_NON_REQUIRED).click();
  await expect(filterInput(page, DEFAULT_NON_REQUIRED)).toHaveValue(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");

  // has default value, required, value same as default
  await checkStatusIcon(page, DEFAULT_REQUIRED, "none");

  // has default value, required, current value different than default
  await updateValue(page, DEFAULT_REQUIRED, otherValue);
  await expect(filterInput(page, DEFAULT_REQUIRED)).toHaveValue(
    otherValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_REQUIRED, "reset");
  await resetButton(page, DEFAULT_REQUIRED).click();
  await expect(filterInput(page, DEFAULT_REQUIRED)).toHaveValue(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_REQUIRED, "none");

  await checkParameterSidebarDefaultValue(page, {
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue,
  });
}

/** Port of checkNativeParametersDropdown (date/field widgets in the parameters bar). */
export async function checkNativeParametersDropdown(
  page: Page,
  {
    defaultValueFormatted,
    otherValueFormatted,
    setValue,
    updateValue = setValue,
    otherValue,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
    setValue: DropdownSetter;
    updateValue?: DropdownSetter;
  },
) {
  // no default value, non-required, no current value
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "chevron");

  // no default value, non-required, has current value
  await filter(page, NO_DEFAULT_NON_REQUIRED).click();
  await setValue(page, otherValue);
  await expect(filter(page, NO_DEFAULT_NON_REQUIRED)).toContainText(
    otherValueFormatted,
  );
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "clear");
  await clearButton(page, NO_DEFAULT_NON_REQUIRED).click();
  await expect(filter(page, NO_DEFAULT_NON_REQUIRED)).toHaveText(
    NO_DEFAULT_NON_REQUIRED,
  );
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "chevron");

  // no default value, required, no current value
  await checkStatusIcon(page, NO_DEFAULT_REQUIRED, "none");

  // no default value, required, has current value
  await filter(page, NO_DEFAULT_REQUIRED).click();
  await updateValue(page, otherValue);
  await expect(filter(page, NO_DEFAULT_REQUIRED)).toContainText(
    otherValueFormatted,
  );

  // has default value, non-required, current value same as default
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await clearButton(page, DEFAULT_NON_REQUIRED).click();
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toHaveText(
    DEFAULT_NON_REQUIRED,
  );

  // has default value, non-required, no current value
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "reset");
  await resetButton(page, DEFAULT_NON_REQUIRED).click();
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");

  // has default value, non-required, current value different than default
  await filter(page, DEFAULT_NON_REQUIRED).click();
  await updateValue(page, otherValue);
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    otherValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "reset");
  await resetButton(page, DEFAULT_NON_REQUIRED).click();
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");

  // has default value, required, value same as default
  await checkStatusIcon(page, DEFAULT_REQUIRED, "none");

  // has default value, required, current value different than default
  await filter(page, DEFAULT_REQUIRED).click();
  await updateValue(page, otherValue);
  await expect(filter(page, DEFAULT_REQUIRED)).toContainText(
    otherValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_REQUIRED, "reset");
  await resetButton(page, DEFAULT_REQUIRED).click();
  await expect(filter(page, DEFAULT_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_REQUIRED, "none");
}

/** Port of checkParameterSidebarDefaultValue (text/number sidebar default value). */
export async function checkParameterSidebarDefaultValue(
  page: Page,
  {
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
    setValue: InputSetter;
    updateValue: InputSetter;
  },
) {
  await openParameterSidebar(page);

  // NO_DEFAULT_NON_REQUIRED
  const s1 = filterSection(page, "no_default_non_required");
  await filter(s1, "Default filter widget value").scrollIntoViewIfNeeded();
  await expect(filterInput(s1, "Default filter widget value")).toHaveValue("");
  await checkStatusIcon(s1, "Default filter widget value", "none");

  await setValue(s1, "Default filter widget value", otherValue);
  await expect(filterInput(s1, "Default filter widget value")).toHaveValue(
    otherValueFormatted,
  );
  await checkStatusIcon(s1, "Default filter widget value", "clear");

  await clearIcon(s1, "Default filter widget value").click();
  await expect(filterInput(s1, "Default filter widget value")).toHaveValue("");
  await checkStatusIcon(s1, "Default filter widget value", "none");

  // DEFAULT_NON_REQUIRED
  const s2 = filterSection(page, "default_non_required");
  await filter(s2, "Default filter widget value").scrollIntoViewIfNeeded();
  await expect(filterInput(s2, "Default filter widget value")).toHaveValue(
    defaultValueFormatted,
  );
  await checkStatusIcon(s2, "Default filter widget value", "clear");

  await clearIcon(s2, "Default filter widget value").click();
  await expect(filterInput(s2, "Default filter widget value")).toHaveValue("");
  await checkStatusIcon(s2, "Default filter widget value", "none");

  await setValue(s2, "Default filter widget value", otherValue);
  await expect(filterInput(s2, "Default filter widget value")).toHaveValue(
    otherValueFormatted,
  );
  await checkStatusIcon(s2, "Default filter widget value", "clear");

  // DEFAULT_REQUIRED
  const s3 = filterSection(page, "default_required");
  await filter(s3, "Default filter widget value").scrollIntoViewIfNeeded();
  await expect(filterInput(s3, "Default filter widget value")).toHaveValue(
    defaultValueFormatted,
  );
  await checkStatusIcon(s3, "Default filter widget value", "clear");

  await clearIcon(s3, "Default filter widget value").click();
  await expect(
    filterInput(s3, "Default filter widget value (required)"),
  ).toHaveValue("");
  await checkStatusIcon(s3, "Default filter widget value (required)", "none");

  await updateValue(s3, "Default filter widget value (required)", otherValue);
  await expect(filterInput(s3, "Default filter widget value")).toHaveValue(
    otherValueFormatted,
  );
  await checkStatusIcon(s3, "Default filter widget value", "clear");

  // NO_DEFAULT_REQUIRED
  const s4 = filterSection(page, "no_default_required");
  await filter(
    s4,
    "Default filter widget value (required)",
  ).scrollIntoViewIfNeeded();
  await expect(
    filterInput(s4, "Default filter widget value (required)"),
  ).toHaveValue("");
  await checkStatusIcon(s4, "Default filter widget value (required)", "none");

  await updateValue(s4, "Default filter widget value (required)", otherValue);
  await expect(filterInput(s4, "Default filter widget value")).toHaveValue(
    otherValueFormatted,
  );
  await checkStatusIcon(s4, "Default filter widget value", "clear");

  await clearButton(s4, "Default filter widget value").click();
  await checkStatusIcon(s4, "Default filter widget value (required)", "none");
}

/** Port of checkParameterSidebarDefaultValueDate. */
export async function checkParameterSidebarDefaultValueDate(
  page: Page,
  {
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
  },
) {
  await openParameterSidebar(page);

  // NO_DEFAULT_NON_REQUIRED
  const s1 = filterSection(page, "no_default_non_required");
  await filter(s1, "Default filter widget value").scrollIntoViewIfNeeded();
  await expect(filter(s1, "Default filter widget value")).toHaveText(
    "Select a default value…",
  );
  await checkStatusIcon(s1, "Default filter widget value", "chevron");
  await filter(s1, "Default filter widget value").click();

  await addDateFilter(page, otherValue);

  await expect(filter(s1, "Default filter widget value")).toHaveText(
    otherValueFormatted,
  );
  await checkStatusIcon(s1, "Default filter widget value", "clear");

  await clearIcon(s1, "Default filter widget value").click();
  await expect(filter(s1, "Default filter widget value")).toHaveText(
    "Select a default value…",
  );
  await checkStatusIcon(s1, "Default filter widget value", "chevron");

  // NO_DEFAULT_REQUIRED
  const s4 = filterSection(page, "no_default_required");
  await filter(
    s4,
    "Default filter widget value (required)",
  ).scrollIntoViewIfNeeded();
  await expect(
    filter(s4, "Default filter widget value (required)"),
  ).toHaveText("Select a default value…");
  await checkStatusIcon(s4, "Default filter widget value (required)", "chevron");
  await filter(s4, "Default filter widget value (required)").click();

  await addDateFilter(page, otherValue);

  await expect(filter(s4, "Default filter widget value")).toHaveText(
    otherValueFormatted,
  );
  await checkStatusIcon(s4, "Default filter widget value", "clear");

  await clearButton(s4, "Default filter widget value").click();
  await checkStatusIcon(s4, "Default filter widget value (required)", "chevron");

  // DEFAULT_NON_REQUIRED
  const s2 = filterSection(page, "default_non_required");
  await filter(s2, "Default filter widget value").scrollIntoViewIfNeeded();
  await expect(filter(s2, "Default filter widget value")).toHaveText(
    defaultValueFormatted,
  );
  await checkStatusIcon(s2, "Default filter widget value", "clear");

  await clearIcon(s2, "Default filter widget value").click();
  await expect(filter(s2, "Default filter widget value")).toHaveText(
    "Select a default value…",
  );
  await checkStatusIcon(s2, "Default filter widget value", "chevron");
  await filter(s2, "Default filter widget value").click();

  await addDateFilter(page, otherValue);

  await expect(filter(s2, "Default filter widget value")).toHaveText(
    otherValueFormatted,
  );
  await checkStatusIcon(s2, "Default filter widget value", "clear");

  // DEFAULT_REQUIRED
  const s3 = filterSection(page, "default_required");
  await filter(s3, "Default filter widget value").scrollIntoViewIfNeeded();
  await expect(filter(s3, "Default filter widget value")).toHaveText(
    defaultValueFormatted,
  );
  await checkStatusIcon(s3, "Default filter widget value", "clear");

  await clearIcon(s3, "Default filter widget value").click();
  await expect(
    filter(s3, "Default filter widget value (required)"),
  ).toHaveText("Select a default value…");
  await checkStatusIcon(s3, "Default filter widget value (required)", "chevron");
  await filter(s3, "Default filter widget value (required)").click();

  await addDateFilter(page, otherValue);

  await expect(filter(s3, "Default filter widget value")).toHaveText(
    otherValueFormatted,
  );
  await checkStatusIcon(s3, "Default filter widget value", "clear");
}

/** Port of checkParameterSidebarDefaultValueDropdown (field widgets). */
export async function checkParameterSidebarDefaultValueDropdown(
  page: Page,
  {
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue = setValue,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
    setValue: DropdownSetter;
    updateValue?: DropdownSetter;
  },
) {
  await openParameterSidebar(page);

  // NO_DEFAULT_NON_REQUIRED
  const s1 = filterSection(page, "no_default_non_required");
  await filter(s1, "Default filter widget value").scrollIntoViewIfNeeded();
  await expect(filter(s1, "Default filter widget value")).toHaveText(
    "Enter a default value…",
  );
  await checkStatusIcon(s1, "Default filter widget value", "chevron");
  await filter(s1, "Default filter widget value").click();

  await setValue(page, otherValue);

  await expect(filter(s1, "Default filter widget value")).toHaveText(
    otherValueFormatted,
  );
  await checkStatusIcon(s1, "Default filter widget value", "clear");

  await clearIcon(s1, "Default filter widget value").click();
  await expect(filter(s1, "Default filter widget value")).toHaveText(
    "Enter a default value…",
  );
  await checkStatusIcon(s1, "Default filter widget value", "chevron");

  // NO_DEFAULT_REQUIRED
  const s4 = filterSection(page, "no_default_required");
  await filter(
    s4,
    "Default filter widget value (required)",
  ).scrollIntoViewIfNeeded();
  await expect(
    filter(s4, "Default filter widget value (required)"),
  ).toHaveText("Enter a default value…");
  await checkStatusIcon(s4, "Default filter widget value (required)", "chevron");
  await filter(s4, "Default filter widget value (required)").click();

  await updateValue(page, otherValue);

  await expect(filter(s4, "Default filter widget value")).toHaveText(
    otherValueFormatted,
  );
  await checkStatusIcon(s4, "Default filter widget value", "clear");

  await clearButton(s4, "Default filter widget value").click();
  await checkStatusIcon(s4, "Default filter widget value (required)", "chevron");

  // DEFAULT_NON_REQUIRED
  const s2 = filterSection(page, "default_non_required");
  await filter(s2, "Default filter widget value").scrollIntoViewIfNeeded();
  await expect(filter(s2, "Default filter widget value")).toHaveText(
    defaultValueFormatted,
  );
  await checkStatusIcon(s2, "Default filter widget value", "clear");

  await clearIcon(s2, "Default filter widget value").click();
  await expect(filter(s2, "Default filter widget value")).toHaveText(
    "Enter a default value…",
  );
  await checkStatusIcon(s2, "Default filter widget value", "chevron");
  await filter(s2, "Default filter widget value").click();

  await setValue(page, otherValue);

  await expect(filter(s2, "Default filter widget value")).toHaveText(
    otherValueFormatted,
  );
  await checkStatusIcon(s2, "Default filter widget value", "clear");

  // DEFAULT_REQUIRED
  const s3 = filterSection(page, "default_required");
  await filter(s3, "Default filter widget value").scrollIntoViewIfNeeded();
  await expect(filter(s3, "Default filter widget value")).toHaveText(
    defaultValueFormatted,
  );
  await checkStatusIcon(s3, "Default filter widget value", "clear");

  await clearIcon(s3, "Default filter widget value").click();
  await expect(
    filter(s3, "Default filter widget value (required)"),
  ).toHaveText("Enter a default value…");
  await checkStatusIcon(s3, "Default filter widget value (required)", "chevron");
  await filter(s3, "Default filter widget value (required)").click();

  await updateValue(page, otherValue);

  await expect(filter(s3, "Default filter widget value")).toHaveText(
    otherValueFormatted,
  );
  await checkStatusIcon(s3, "Default filter widget value", "clear");
}
