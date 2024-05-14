import { useKBar } from "kbar";
import { useEffect } from "react";
import { Route, withRouter, type WithRouterProps } from "react-router";
import _ from "underscore";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupRecentViewsEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  within,
  waitFor,
  mockScrollTo,
  mockScrollIntoView,
} from "__support__/ui";
import { getAdminPaths } from "metabase/admin/app/reducers";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockRecentCollectionItem,
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

    useEffect(() => {
      if (q) {
        query.setSearch(q);
      }
    }, [q, query]);

    return <PaletteResults />;
  },
);

const DATABASE = createMockDatabase();

const collection_1 = createMockCollection({
  name: "lame collection",
  id: 3,
});

//Verified, but no collection details present
const model_1 = createMockCollectionItem({
  model: "dataset",
  name: "Foo Question",
  moderated_status: "verified",
  id: 1,
});

const model_2 = createMockCollectionItem({
  model: "dataset",
  name: "Bar Question",
  collection: collection_1,
  id: 2,
});

const dashboard = createMockCollectionItem({
  model: "dashboard",
  name: "Bar Dashboard",
  collection: collection_1,
  description: "Such Bar. Much Wow.",
});

const recents_1 = createMockRecentCollectionItem({
  ..._.pick(model_1, "id", "name"),
  model: "dataset",
  moderated_status: "verified",
  parent_collection: {
    id: null,
    name: "Our analytics",
  },
});
const recents_2 = createMockRecentCollectionItem({
  ..._.pick(dashboard, "id", "name"),
  model: "dashboard",
  parent_collection: {
    id: dashboard.collection?.id as number,
    name: dashboard.collection?.name as string,
  },
});

mockScrollTo();
mockScrollIntoView();

const setup = ({ query }: { query?: string } = {}) => {
  setupDatabasesEndpoints([DATABASE]);
  setupSearchEndpoints([model_1, model_2, dashboard]);
  setupRecentViewsEndpoints([recents_1, recents_2]);

  renderWithProviders(
    <Route path="/" component={() => <TestComponent q={query} isLoggedIn />} />,
    {
      withKBar: true,
      withRouter: true,
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
  afterAll(() => {
    jest.resetAllMocks();
  });

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
    expect(
      await screen.findByRole("option", { name: "Bar Dashboard" }),
    ).toHaveTextContent("lame collection");

    expect(
      await screen.findByRole("link", { name: "Bar Dashboard" }),
    ).toHaveAttribute("href", "/dashboard/1-bar-dashboard");

    expect(
      await screen.findByRole("option", { name: "Foo Question" }),
    ).toHaveTextContent("Our analytics");

    //Foo Question should be displayed with a verified badge
    expect(
      await within(
        await screen.findByRole("option", { name: "Foo Question" }),
      ).findByRole("img", { name: /verified_filled/ }),
    ).toBeInTheDocument();
  });

  it("should allow you to search entities, and provide a docs link", async () => {
    setup({ query: "Bar" });

    await waitFor(async () => {
      expect(await screen.findByText("Search results")).toBeInTheDocument();
    });

    expect(
      await screen.findByRole("option", { name: /View and filter/i }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("option", { name: "Bar Dashboard" }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: "Bar Dashboard" }),
    ).toHaveAttribute("href", "/dashboard/1-bar-dashboard");

    expect(
      await screen.findByRole("option", { name: "Bar Dashboard" }),
    ).toHaveTextContent("Such Bar. Much Wow.");
    expect(
      await screen.findByText('Search documentation for "Bar"'),
    ).toBeInTheDocument();
  });

  it("should display collections that search results are from", async () => {
    setup({ query: "ques" });
    expect(
      await screen.findByRole("option", { name: "Foo Question" }),
    ).toHaveTextContent("Our analytics");

    //Foo Question should be displayed with a verified badge
    expect(
      await within(
        await screen.findByRole("option", { name: "Foo Question" }),
      ).findByRole("img", { name: /verified_filled/ }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("option", { name: "Bar Question" }),
    ).toHaveTextContent("lame collection");
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
