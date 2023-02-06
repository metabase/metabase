import { navigationSidebar } from "__support__/e2e/helpers";

export function displaySidebarChildOf(collectionName) {
  navigationSidebar()
    .findByText(collectionName)
    .parentsUntil("[data-testid=sidebar-collection-link-root]")
    .find(".Icon-chevronright")
    .eq(0) // there may be more nested icons, but we need the top level one
    .click();
}
