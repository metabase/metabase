export function getSidebarCollectionChildrenFor(item) {
  return cy
    .get("aside")
    .findByText(item)
    .closest("a")
    .parent()
    .parent();
}
