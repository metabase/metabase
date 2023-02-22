import React from "react";
import { render, screen } from "@testing-library/react";
import HomeXrayCard, { HomeXrayCardProps } from "./HomeXrayCard";

describe("HomeXrayCard", () => {
  it("should render correctly", () => {
    const props = getProps({
      title: "Orders",
      message: "A look at",
    });

    render(<HomeXrayCard {...props} />);

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("A look at")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<HomeXrayCardProps>): HomeXrayCardProps => ({
  title: "Orders",
  message: "A look at",
  url: "/question/1",
  ...opts,
});
