import { renderWithProviders, screen } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { CollectionBreadcrumbsWithTooltip } from "./CollectionBreadcrumbsWithTooltip";

const setup = (collection: Collection) => {
  return renderWithProviders(
    <CollectionBreadcrumbsWithTooltip
      collection={collection}
      containerName="Container"
    />,
  );
};
const collectionAlpha = createMockCollection({ id: 99, name: "Alpha" });
const collectionBeta = createMockCollection({
  id: 1,
  name: "Beta",
  effective_ancestors: [collectionAlpha],
});
const collectionCharlie = createMockCollection({
  id: 2,
  name: "Charlie",
  effective_ancestors: [collectionAlpha, collectionBeta],
});

describe("CollectionBreadcrumbsWithTooltip", () => {
  it("should show a single collection", () => {
    setup(collectionAlpha);
    expect(screen.getByLabelText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("should display a path of length two without abbreviations", () => {
    setup(collectionBeta);
    const breadcrumbs = screen.getByLabelText("Alpha / Beta");
    expect(breadcrumbs).toBeInTheDocument();
    expect(breadcrumbs?.textContent).toMatch(/Alpha\/Beta/);
  });

  it("should display a path of length three as the first and last collection with an ellipsis in between", () => {
    setup(collectionCharlie);
    const breadcrumbs = screen.getByLabelText("Alpha / Beta / Charlie");
    expect(breadcrumbs).toBeInTheDocument();
    expect(breadcrumbs?.textContent).toMatch(/Alpha\/…\/Charlie/);
  });
});
