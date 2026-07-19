/**
 * Helpers for the dashboard-filters-remapping spec port
 * (dashboard-filters/dashboard-filters-remapping.cy.spec.ts).
 *
 * The spec's `findWidget` is `H.dashboardParametersContainer().findByLabelText(name)`.
 * findByLabelText is an EXACT accessible-name match (rule 1), and it must be
 * exact here: the parameter names collide as substrings ("FK" ⊂ "FK->Name" ⊂
 * "PK+FK->Name"). It also cannot be a text-content match (dashboard-parameters.ts
 * `filterWidget`/native-filters-extras `filterWidgetByName`): every widget in
 * this spec carries a remapped default value, so the visible text is the *value*
 * ("Small Marble Shoes"), never the parameter name. The stable handle is the
 * trigger's aria-label, which the FE sets to `parameter.name`
 * (ParameterValueWidgetTrigger ariaLabel) — so getByLabel(name, { exact }).
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { dashboardParametersContainer } from "./dashboard-parameters";
import { icon, popover } from "./ui";

/** Port of the spec-local findWidget: the parameter widget by exact label. */
export function findWidget(page: Page, name: string): Locator {
  return dashboardParametersContainer(page).getByLabel(name, { exact: true });
}

/**
 * Port of the spec-local clearWidget: findWidget(name).icon("close").click().
 * The clear icon (WidgetStatus) renders inside the aria-labelled trigger; hover
 * first, matching the shared clearFilterWidget's hover-gating.
 */
export async function clearWidget(page: Page, name: string) {
  const widget = findWidget(page, name);
  await widget.hover();
  await icon(widget, "close").click();
}

/** Port of testDefaultValuesRemapping: each widget shows its remapped default. */
export async function testDefaultValuesRemapping(page: Page) {
  await expect(findWidget(page, "Internal")).toContainText("N1");
  await expect(findWidget(page, "FK")).toContainText("Small Marble Shoes");
  await expect(findWidget(page, "PK->Name")).toContainText("Lina Heaney");
  await expect(findWidget(page, "FK->Name")).toContainText("Arnold Adams");
  await expect(findWidget(page, "PK+FK->Name")).toContainText(
    "Dominique Leffler",
  );
}

/**
 * Port of testWidgetsRemapping: clear each widget, pick a new value in its
 * dropdown, and assert the widget shows the remapped display value. Cypress
 * typed "id," into the ID token fields — the trailing comma commits the token,
 * which needs real keystrokes (pressSequentially, not fill; rule 5).
 */
export async function testWidgetsRemapping(page: Page) {
  // internal remapping
  await clearWidget(page, "Internal");
  await findWidget(page, "Internal").click();
  await popover(page).getByText("N5", { exact: true }).click();
  await popover(page).getByRole("button", { name: "Update filter" }).click();
  await expect(findWidget(page, "Internal")).toContainText("N5");

  // FK remapping
  await clearWidget(page, "FK");
  await findWidget(page, "FK").click();
  await popover(page)
    .getByPlaceholder("Enter an ID", { exact: true })
    .pressSequentially("1,");
  await expect(
    popover(page).getByText("Rustic Paper Wallet", { exact: true }),
  ).toBeVisible();
  await popover(page).getByRole("button", { name: "Update filter" }).click();
  await expect(findWidget(page, "FK")).toContainText("Rustic Paper Wallet");

  // PK->Name remapping
  await clearWidget(page, "PK->Name");
  await findWidget(page, "PK->Name").click();
  await popover(page)
    .getByPlaceholder("Enter an ID", { exact: true })
    .pressSequentially("1,");
  await expect(
    popover(page).getByText("Hudson Borer", { exact: true }),
  ).toBeVisible();
  await popover(page).getByRole("button", { name: "Update filter" }).click();
  await expect(findWidget(page, "PK->Name")).toContainText("Hudson Borer");

  // FK->Name remapping
  await clearWidget(page, "FK->Name");
  await findWidget(page, "FK->Name").click();
  await popover(page)
    .getByPlaceholder("Enter an ID", { exact: true })
    .pressSequentially("6,");
  await expect(
    popover(page).getByText("Rene Muller", { exact: true }),
  ).toBeVisible();
  await popover(page).getByRole("button", { name: "Update filter" }).click();
  await expect(findWidget(page, "FK->Name")).toContainText("Rene Muller");

  // PK+FK->Name remapping
  await clearWidget(page, "PK+FK->Name");
  await findWidget(page, "PK+FK->Name").click();
  await popover(page)
    .getByPlaceholder("Enter an ID", { exact: true })
    .pressSequentially("7,");
  await expect(
    popover(page).getByText("Roselyn Bosco", { exact: true }),
  ).toBeVisible();
  await popover(page).getByRole("button", { name: "Update filter" }).click();
  await expect(findWidget(page, "PK+FK->Name")).toContainText("Roselyn Bosco");
}
