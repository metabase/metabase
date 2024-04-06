import { KBarProvider, useKBar } from "kbar";
import { withRouter, type WithRouterProps } from "react-router";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupRecentViewsEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  mockGetBoundingClientRect,
} from "__support__/ui";
import { getAdminPaths } from "metabase/admin/app/reducers";
import {
  createMockCollectionItem,
  createMockDatabase,
  createMockModelObject,
  createMockRecentItem,
} from "metabase-types/api/mocks";
import {
  createMockAdminAppState,
  createMockAdminState,
} from "metabase-types/store/mocks";

import { useCommandPaletteBasicActions } from "../hooks/useCommandPaletteBasicActions";

import { PaletteResults } from "./PaletteResults";

const TestComponent = withRouter(
  ({ q, ...props }: WithRouterProps & { q?: string; isLoggedIn: boolean }) => {
    useCommandPaletteBasicActions(props);

    const { query } = useKBar();

    if (q) {
      query.setSearch(q);
    }

    return <PaletteResults />;
  },
);

const DATABASE = createMockDatabase();
const model = createMockCollectionItem({
  model: "dataset",
  name: "Foo Question",
});
const dashboard = createMockCollectionItem({
  model: "dashboard",
  name: "Bar Dashboard",
});

const recents = createMockRecentItem({
  model: "dataset",
  model_object: createMockModelObject(model),
});

mockGetBoundingClientRect();

const setup = ({ query }: { query?: string } = {}) => {
  setupDatabasesEndpoints([DATABASE]);
  setupSearchEndpoints([model, dashboard]);
  setupRecentViewsEndpoints([recents]);

  renderWithProviders(
    <KBarProvider>
      <TestComponent q={query} isLoggedIn />
    </KBarProvider>,
    {
      storeInitialState: {
        admin: createMockAdminState({
          app: createMockAdminAppState({
            paths: getAdminPaths(),
          }),
        }),
      },
    },
  );
};

describe("PaletteResults", () => {
  it("should show default actions", async () => {
    setup();
    expect(await screen.findByText("New dashboard")).toBeInTheDocument();
    expect(await screen.findByText("New collection")).toBeInTheDocument();
    expect(await screen.findByText("New model")).toBeInTheDocument();

    expect(screen.queryByText("Search results")).not.toBeInTheDocument();
  });

  //For some reason, New Question isn't showing up without searching. My guess is virtualization weirdness
  it("should allow you to create a new question", async () => {
    setup({ query: "ques" });
    expect(await screen.findByText("New question")).toBeInTheDocument();
  });

  it("should show you recent items", async () => {
    setup();
    expect(await screen.findByText("Recent items")).toBeInTheDocument();
    expect(await screen.findByText("Foo Question")).toBeInTheDocument();
  });

  it("should allow you to search entities, and provide a docs link", async () => {
    setup({ query: "Bar" });
    expect(await screen.findByText("Search results")).toBeInTheDocument();
    expect(await screen.findByText("Bar Dashboard")).toBeInTheDocument();
    expect(
      await screen.findByText('Search documentation for "Bar"'),
    ).toBeInTheDocument();
  });

  it("should provide links to settings pages", async () => {
    setup({ query: "setu" });
    expect(await screen.findByText("Admin")).toBeInTheDocument();
    expect(await screen.findByText("Settings - Setup")).toBeInTheDocument();
  });

  it("should provide links to admin pages", async () => {
    setup({ query: "permi" });
    expect(await screen.findByText("Admin")).toBeInTheDocument();
    expect(await screen.findByText("Permissions")).toBeInTheDocument();
  });
});
