import { popover } from "./e2e-ui-elements-helpers";

export function benchNavMenu() {
  return cy.findByTestId("bench-nav-menu");
}

export function benchNavItem(label: string) {
  return benchNavMenu().findByText(label);
}

export function benchNavMenuButton() {
  return cy.findByTestId("bench-nav-menu-button");
}

export function benchSidebar() {
  return cy.findByTestId("bench-sidebar");
}

export function newMetricButton() {
  return cy.findByRole("button", { name: "New metric" });
}

export function benchSidebarListItems() {
  return benchSidebar().findAllByTestId("bench-sidebar-list-item");
}

export function benchSidebarListItem(index: number = 0) {
  // eslint-disable-next-line no-unsafe-element-filtering
  return benchSidebarListItems().eq(index);
}

export function benchSidebarTreeItems() {
  return benchSidebar().findAllByTestId("bench-sidebar-tree-item");
}

export function benchSidebarTreeItem(index: number = 0) {
  // eslint-disable-next-line no-unsafe-element-filtering
  return benchSidebarTreeItems().eq(index);
}

export function benchMainPaneHeader() {
  return cy.findByTestId("bench-pane-header");
}

export function benchListSettingsButton() {
  return cy.findByTestId("bench-list-settings-button");
}

export function setBenchListSorting(sorting: "Alphabetical" | "By collection") {
  benchListSettingsButton().click();
  popover().findByText(sorting).click();
}
