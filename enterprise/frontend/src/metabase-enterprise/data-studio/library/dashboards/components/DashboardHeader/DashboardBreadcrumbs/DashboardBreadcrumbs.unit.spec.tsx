import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { CollectionId } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { DashboardBreadcrumbs } from "./DashboardBreadcrumbs";

const LIBRARY = createMockCollection({
  id: 1,
  name: "Library",
  type: "library",
});
const DASHBOARDS = createMockCollection({
  id: 2,
  name: "Dashboards",
  type: "library-dashboards",
});
const SALES = createMockCollection({
  id: 3,
  name: "Sales",
  type: "library-dashboards",
  effective_ancestors: [LIBRARY, DASHBOARDS],
});
const EXAMPLES = createMockCollection({ id: 5, name: "Examples" });

type SetupOpts = {
  collectionId: CollectionId;
};

function setup({ collectionId }: SetupOpts) {
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection(ROOT_COLLECTION),
      LIBRARY,
      DASHBOARDS,
      SALES,
      EXAMPLES,
    ],
  });

  renderWithProviders(
    <DashboardBreadcrumbs
      dashboard={createMockDashboard({
        name: "Sales overview",
        collection_id: collectionId,
      })}
    />,
    { withRouter: true },
  );
}

describe("DashboardBreadcrumbs", () => {
  it("leads through the Dashboards section and its folders for a Library dashboard", async () => {
    setup({ collectionId: SALES.id });

    expect(await screen.findByRole("link", { name: "Sales" })).toHaveAttribute(
      "href",
      "/data-studio/dashboards?expandedId=3",
    );
    expect(screen.getByRole("link", { name: "Dashboards" })).toHaveAttribute(
      "href",
      "/data-studio/dashboards",
    );
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
  });

  it("leads to the collection pages of a dashboard outside the Library", async () => {
    setup({ collectionId: EXAMPLES.id });

    expect(
      await screen.findByRole("link", { name: "Examples" }),
    ).toHaveAttribute("href", "/collection/5-examples");
    expect(
      screen.queryByRole("link", { name: "Dashboards" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
  });
});
