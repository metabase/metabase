export function getSidebarCollectionChildrenFor(item) {
  return cy
    .findByTestId("sidebar")
    .findByText(item)
    .closest("a")
    .parent()
    .parent();
}
