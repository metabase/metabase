import React from "react";
import { render, screen } from "@testing-library/react";
import {
  createMockDatabase,
  createMockPopularItem,
  createMockRecentItem,
  createMockUser,
} from "metabase-types/api/mocks";
import HomeContent, { HomeContentProps } from "./HomeContent";

const PopularSectionMock = () => <div>PopularSection</div>;
jest.mock("../../containers/HomePopularSection", () => PopularSectionMock);

const RecentSectionMock = () => <div>RecentSection</div>;
jest.mock("../../containers/HomeRecentSection", () => RecentSectionMock);

const XraySectionMock = () => <div>XraySection</div>;
jest.mock("../../containers/HomeXraySection", () => XraySectionMock);

describe("HomeContent", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 10));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render popular items for a new user", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        first_login: "2020-01-05T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentItem()],
      popularItems: [createMockPopularItem()],
    });

    render(<HomeContent {...props} />);

    expect(screen.getByText("PopularSection")).toBeInTheDocument();
  });

  it("should render popular items for a user without recent items", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        first_login: "2020-01-05T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [],
      popularItems: [createMockPopularItem()],
    });

    render(<HomeContent {...props} />);

    expect(screen.getByText("PopularSection")).toBeInTheDocument();
  });

  it("should render recent items for an existing user", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        first_login: "2020-01-01T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentItem()],
    });

    render(<HomeContent {...props} />);

    expect(screen.getByText("RecentSection")).toBeInTheDocument();
  });

  it("should render x-rays for an installer after the setup", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [],
    });

    render(<HomeContent {...props} />);

    expect(screen.getByText("XraySection")).toBeInTheDocument();
  });

  it("should render x-rays for the installer when there is no question and dashboard", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [createMockDatabase()],
      recentItems: [createMockRecentItem()],
    });

    render(<HomeContent {...props} />);

    expect(screen.getByText("XraySection")).toBeInTheDocument();
  });

  it("should render nothing if there are no databases", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: [],
      recentItems: [],
    });

    render(<HomeContent {...props} />);

    expect(screen.queryByText("XraySection")).not.toBeInTheDocument();
  });

  it("should render loading state if there is not enough data to choose a section", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: true,
        has_question_and_dashboard: false,
        first_login: "2020-01-10T00:00:00Z",
      }),
      databases: undefined,
    });

    render(<HomeContent {...props} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<HomeContentProps>): HomeContentProps => ({
  user: createMockUser(),
  databases: [],
  recentItems: [],
  popularItems: [],
  ...opts,
});
