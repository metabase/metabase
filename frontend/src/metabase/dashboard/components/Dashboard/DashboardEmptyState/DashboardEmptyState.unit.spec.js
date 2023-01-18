import React from "react";
import { render, screen } from "@testing-library/react";

import DashboardEmptyState from "./DashboardEmptyState";

describe("DashboardEmptyState", () => {
  it("renders", () => {
    render(<DashboardEmptyState isNightMode={false} />);

    expect(screen.getByText("?")).toBeInTheDocument();
    expect(
      screen.getByText("This dashboard is looking empty."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Add a question to start making it useful!"),
    ).toBeInTheDocument();
  });
});
