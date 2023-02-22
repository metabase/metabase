import React from "react";
import { render, screen } from "@testing-library/react";
import HomeLayout, { HomeLayoutProps } from "./HomeLayout";

const HomeGreetingMock = () => <div>Hey there</div>;
jest.mock("../../containers/HomeGreeting", () => HomeGreetingMock);

describe("HomeLayout", () => {
  it("should render correctly", () => {
    const props = getProps();

    render(<HomeLayout {...props} />);

    expect(screen.getByText("Hey there")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<HomeLayoutProps>): HomeLayoutProps => ({
  showIllustration: false,
  ...opts,
});
