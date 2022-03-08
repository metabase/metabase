import React from "react";
import { render, screen } from "@testing-library/react";
import EventEmptyState from "./EventEmptyState";

describe("EventEmptyState", () => {
  it("should render correctly", () => {
    render(<EventEmptyState />);

    expect(screen.getByLabelText("star icon")).toBeInTheDocument();
  });
});
