import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import { Database, PopularItem, RecentItem, User } from "metabase-types/api";
import {
  createMockDatabase,
  createMockPopularItem,
  createMockRecentItem,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import HomeContent from "./HomeContent";

const PopularSectionMock = () => <div>PopularSection</div>;
jest.mock("../HomePopularSection", () => PopularSectionMock);

const RecentSectionMock = () => <div>RecentSection</div>;
jest.mock("../HomeRecentSection", () => RecentSectionMock);

const XraySectionMock = () => <div>XraySection</div>;
jest.mock("../../containers/HomeXraySection", () => XraySectionMock);

interface SetupOpts {
  user: User;
  databases?: Database[];
  recentItems?: RecentItem[];
  popularItems?: PopularItem[];
  isXrayEnabled?: boolean;
}

const setup = ({
  user,
  databases,
  recentItems,
  popularItems,
  isXrayEnabled = true,
}: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases }),
  });
  const metadata = getMetadata(state);

  renderWithProviders(
    <HomeContent
      user={user}
      databases={databases?.map(({ id }) =>
        checkNotNull(metadata.database(id)),
      )}
      recentItems={recentItems}
      popularItems={popularItems}
      isXrayEnabled={isXrayEnabled}
    />,
    { storeInitialState: state },
  );
};

describe("HomeContent", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 10));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render popular items for a new user", () => {
    setup({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        first_login: "2020-01-05T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentItem()],
      popularItems: [createMockPopularItem()],
    });

    expect(screen.getByText("PopularSection")).toBeInTheDocument();
  });

  it("should render popular items for a user without recent items", () => {
    setup({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        first_login: "2020-01-05T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [],
      popularItems: [createMockPopularItem()],
    });

    expect(screen.getByText("PopularSection")).toBeInTheDocument();
  });

  it("should render recent items for an existing user", () => {
    setup({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        first_login: "2020-01-01T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentItem()],
    });

    expect(screen.getByText("RecentSection")).toBeInTheDocument();
  });

  it("should render x-rays for an installer after the setup", () => {
    setup({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [],
    });

    expect(screen.getByText("XraySection")).toBeInTheDocument();
  });

  it("should render x-rays for the installer when there is no question and dashboard", () => {
    setup({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentItem()],
    });

    expect(screen.getByText("XraySection")).toBeInTheDocument();
  });

  it("should not render x-rays for the installer when there is no question and dashboard if the x-rays feature is disabled", () => {
    setup({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentItem()],
      isXrayEnabled: false,
    });

    expect(screen.queryByText("XraySection")).not.toBeInTheDocument();
  });

  it("should render nothing if there are no databases", () => {
    setup({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [],
      recentItems: [],
    });

    expect(screen.queryByText("XraySection")).not.toBeInTheDocument();
  });

  it("should render loading state if there is not enough data to choose a section", () => {
    setup({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: undefined,
    });

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
