import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
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

function setup({ showIcons }: { showIcons?: boolean } = {}) {
  setupCollectionByIdEndpoint({ collections: [COLLECTION] });

  return renderWithProviders(
    <Route
      path="*"
      element={
        <CollectionBreadcrumbs
          baseCollectionId={null}
          collection={COLLECTION}
          dashboard={DASHBOARD}
          showIcons={showIcons}
        />
      }
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

  it("renders crumb icons by default", async () => {
    setup();

    expect(await screen.findByText("Foo Collection")).toBeInTheDocument();
    expect(screen.getByLabelText("folder icon")).toBeInTheDocument();
    expect(screen.getByLabelText("dashboard icon")).toBeInTheDocument();
  });

  it("renders crumbs without icons when showIcons is false", async () => {
    setup({ showIcons: false });

    expect(await screen.findByText("Foo Collection")).toBeInTheDocument();
    expect(screen.getByText("Bar Dashboard")).toBeInTheDocument();
    expect(screen.queryByLabelText(/icon$/)).not.toBeInTheDocument();
  });
});
