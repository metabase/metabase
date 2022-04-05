import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockRecentItem, createMockUser } from "metabase-types/api/mocks";
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
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render popular items for a new user", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        date_joined: "2020-01-05T00:00:00Z",
      }),
      recentItems: [createMockRecentItem()],
    });

    render(<HomeContent {...props} />);

    expect(screen.getByText("PopularSection")).toBeInTheDocument();
  });

  it("should render popular items for a user without recent items", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        date_joined: "2020-01-15T00:00:00Z",
      }),
      recentItems: [],
    });

    render(<HomeContent {...props} />);

    expect(screen.getByText("PopularSection")).toBeInTheDocument();
  });

  it("should render recent items for an existing user", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: false,
        has_question_and_dashboard: true,
        date_joined: "2020-01-15T00:00:00Z",
      }),
      recentItems: [createMockRecentItem()],
    });

    render(<HomeContent {...props} />);

    expect(screen.getByText("RecentSection")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<HomeContentProps>): HomeContentProps => ({
  user: createMockUser(),
  databases: [],
  recentItems: [],
  ...opts,
});
