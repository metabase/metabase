import { Route } from "react-router";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { CollectionBreadcrumbs } from "./CollectionBreadcrumbs";

const COLLECTION = createMockCollection({
  id: 3,
  name: "Foo Collection",
});

const DASHBOARD = createMockDashboard({
  id: 4,
  name: "Bar Dashboard",
  collection_id: 3,
});

function setup() {
  setupCollectionByIdEndpoint({ collections: [COLLECTION] });

  return renderWithProviders(
    <Route
      path="*"
      component={() => (
        <CollectionBreadcrumbs
          baseCollectionId={null}
          collection={COLLECTION}
          dashboard={DASHBOARD}
        />
      )}
    />,
    { withRouter: true },
  );
}

describe("CollectionBreadcrumbs", () => {
  it("renders dashboard breadcrumbs inside the same wrapper as collection breadcrumbs (#76202)", async () => {
    const { container } = setup();

    const collectionLink = (await screen.findByText("Foo Collection")).closest(
      "a",
    );
    const dashboardLink = screen.getByText("Bar Dashboard").closest("a");

    expect(collectionLink).not.toBeNull();
    expect(dashboardLink).not.toBeNull();
    expect(collectionLink?.parentElement).toBe(dashboardLink?.parentElement);
    expect(
      Array.from(container.children).filter(
        (child) => child.tagName.toLowerCase() !== "style",
      ),
    ).toHaveLength(1);
  });
});
