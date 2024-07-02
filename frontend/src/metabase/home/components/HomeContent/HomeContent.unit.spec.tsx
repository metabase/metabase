import {
  setupDatabaseCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupPopularItemsEndpoints,
  setupRecentViewsEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type {
  Database,
  PopularItem,
  RecentItem,
  Settings,
  User,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockPopularTableItem,
  createMockRecentTableItem,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { HomeContent } from "./HomeContent";

interface SetupOpts {
  user: User;
  databases?: Database[];
  recentItems?: RecentItem[];
  popularItems?: PopularItem[];
  isXrayEnabled?: boolean;
  settings?: Partial<Settings>;
}

const setup = async ({
  user,
  databases = [],
  recentItems = [],
  popularItems = [],
  isXrayEnabled = true,
  settings = {},
}: SetupOpts) => {
  const state = createMockState({
    currentUser: user,
    settings: createMockSettingsState({
      "enable-xrays": isXrayEnabled,
      ...settings,
    }),
  });

  setupDatabasesEndpoints(databases);
  setupRecentViewsEndpoints(recentItems);
  setupPopularItemsEndpoints(popularItems);
  databases.forEach(({ id }) => setupDatabaseCandidatesEndpoint(id, []));

  renderWithProviders(<HomeContent />, { storeInitialState: state });

  await waitForLoaderToBeRemoved();
};

describe("HomeContent", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      advanceTimers: true,
      now: new Date(2020, 0, 10),
      doNotFake: ["setTimeout"],
    });
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render popular items for a new user", async () => {
    await setup({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        first_login: "2020-01-05T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentTableItem()],
      popularItems: [createMockPopularTableItem()],
    });

    expect(
      await screen.findByText("Here are some popular tables"),
    ).toBeInTheDocument();
  });

  it("should render popular items for a user without recent items", async () => {
    await setup({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        first_login: "2020-01-05T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      popularItems: [createMockPopularTableItem()],
    });

    expect(
      screen.getByText("Here are some popular tables"),
    ).toBeInTheDocument();
  });

  it("should render recent items for an existing user", async () => {
    await setup({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        first_login: "2020-01-01T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentTableItem()],
    });

    expect(screen.getByText("Pick up where you left off")).toBeInTheDocument();
  });

  it("should render x-rays for an installer after the setup", async () => {
    await setup({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [createMockDatabase()],
    });

    expect(screen.getByText(/Here are some explorations/)).toBeInTheDocument();
  });

  it("should render x-rays for the installer when there is no question and dashboard", async () => {
    await setup({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentTableItem()],
    });

    expect(screen.getByText(/Here are some explorations/)).toBeInTheDocument();
  });

  it("should not render x-rays for the installer when there is no question and dashboard if the x-rays feature is disabled", async () => {
    await setup({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentTableItem()],
      isXrayEnabled: false,
    });

    expect(
      screen.queryByText(/Here are some explorations/),
    ).not.toBeInTheDocument();
  });

  it("should render nothing if there are no databases", async () => {
    await setup({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
    });

    expect(
      screen.queryByText(/Here are some explorations/),
    ).not.toBeInTheDocument();
  });

  describe("embed-focused homepage", () => {
    it("should show it for admins if 'embedding-homepage' is visible", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        settings: { "embedding-homepage": "visible" },
      });

      expect(screen.getByText("Embedding Metabase")).toBeInTheDocument();
      expect(screen.getByText("The TL;DR:")).toBeInTheDocument();
    });

    it("should not show it for non-admins even if 'embedding-homepage' is visible", async () => {
      await setup({
        user: createMockUser({ is_superuser: false }),
        settings: { "embedding-homepage": "visible" },
      });

      expect(screen.queryByText("Embedding Metabase")).not.toBeInTheDocument();
      expect(screen.queryByText("The TL;DR:")).not.toBeInTheDocument();
    });

    it("should not show it if 'embedding-homepage' is not 'visible'", async () => {
      await setup({
        user: createMockUser({ is_superuser: true }),
        settings: { "embedding-homepage": "hidden" },
      });

      expect(screen.queryByText("Embedding Metabase")).not.toBeInTheDocument();
      expect(screen.queryByText("The TL;DR:")).not.toBeInTheDocument();
    });
  });
});
