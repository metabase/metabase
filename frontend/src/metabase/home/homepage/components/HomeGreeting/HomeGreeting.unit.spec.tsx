import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockUser } from "metabase-types/api/mocks";
import HomeGreeting, { HomeGreetingProps } from "./HomeGreeting";

describe("HomeGreeting", () => {
  it("should render with logo", () => {
    const props = getProps({
      user: createMockUser({ first_name: "John" }),
      showLogo: true,
    });

    render(<HomeGreeting {...props} />);

    expect(screen.getByText(/John/)).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("should render without logo", () => {
    const props = getProps({
      user: createMockUser({ first_name: "John" }),
      showLogo: false,
    });

    render(<HomeGreeting {...props} />);

    expect(screen.getByText(/John/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<HomeGreetingProps>): HomeGreetingProps => ({
  user: createMockUser(),
  showLogo: false,
  ...opts,
});
