import React from "react";
import { render, screen } from "@testing-library/react";
import HomeModelCard, { HomeModelCardProps } from "./HomeModelCard";

describe("HomeModelCard", () => {
  it("should render correctly", () => {
    const props = getProps({
      title: "Orders",
      icon: { name: "table" },
    });

    render(<HomeModelCard {...props} />);

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("table icon")).toBeInTheDocument();
  });
});

const getProps = (opts?: Partial<HomeModelCardProps>): HomeModelCardProps => ({
  title: "Orders",
  icon: { name: "question" },
  url: "/question/1",
  ...opts,
});
