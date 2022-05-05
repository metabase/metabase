import React from "react";
import { render, screen } from "@testing-library/react";
import HomeRecentSection, { HomeRecentSectionProps } from "./HomeRecentSection";
import { createMockRecentItem, createMockUser } from "metabase-types/api/mocks";

describe("HomeRecentSection", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 10));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render a list of recent items", () => {
    const props = getProps({
      recentItems: [
        createMockRecentItem({
          model: "table",
          model_object: {
            name: "Orders",
          },
        }),
      ],
    });

    render(<HomeRecentSection {...props} />);

    expect(screen.getByText("Pick up where you left off")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
  });

  it("should show a help link for new installers", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: true,
        first_login: "2020-01-05T00:00:00Z",
      }),
      recentItems: [
        createMockRecentItem({
          model: "table",
          model_object: {
            name: "Orders",
          },
        }),
      ],
    });

    render(<HomeRecentSection {...props} />);

    expect(screen.getByText("Metabase tips")).toBeInTheDocument();
  });

  it("should not show a help link for regular users", () => {
    const props = getProps({
      user: createMockUser({
        is_installer: false,
        first_login: "2020-01-05T00:00:00Z",
      }),
      recentItems: [
        createMockRecentItem({
          model: "table",
          model_object: {
            name: "Orders",
          },
        }),
      ],
    });

    render(<HomeRecentSection {...props} />);

    expect(screen.queryByText("Metabase tips")).not.toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<HomeRecentSectionProps>,
): HomeRecentSectionProps => ({
  user: createMockUser(),
  recentItems: [],
  ...opts,
});
