import React from "react";
import { Database, PopularItem, RecentItem, User } from "metabase-types/api";
import {
  createMockDatabase,
  createMockPopularItem,
  createMockRecentItem,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  setupDatabaseCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupPopularItemsEndpoints,
  setupRecentViewsEndpoints,
} from "__support__/server-mocks";
import { HomeContent } from "./HomeContent";

interface SetupOpts {
  user: User;
  databases?: Database[];
  recentItems?: RecentItem[];
  popularItems?: PopularItem[];
  isXrayEnabled?: boolean;
}

const setup = async ({
  user,
  databases = [],
  recentItems = [],
  popularItems = [],
  isXrayEnabled = true,
}: SetupOpts) => {
  const state = createMockState({
    currentUser: user,
    settings: createMockSettingsState({
      "enable-xrays": isXrayEnabled,
    }),
  });

  setupDatabasesEndpoints(databases);
  setupRecentViewsEndpoints(recentItems);
  setupPopularItemsEndpoints(popularItems);
  databases.forEach(({ id }) => setupDatabaseCandidatesEndpoint(id, []));

  renderWithProviders(<HomeContent />, { storeInitialState: state });

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/i));
};

describe("HomeContent", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date(2020, 0, 10));
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
      recentItems: [createMockRecentItem()],
      popularItems: [createMockPopularItem()],
    });

    expect(
      screen.getByText("Here are some popular tables"),
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
      popularItems: [createMockPopularItem()],
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
      recentItems: [createMockRecentItem()],
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
      recentItems: [createMockRecentItem()],
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
      recentItems: [createMockRecentItem()],
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
});
