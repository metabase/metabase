import React from "react";
import { render, screen } from "@testing-library/react";

import DashboardEmptyState from "./DashboardEmptyState";

it("renders", () => {
  render(<DashboardEmptyState isNightMode={false} />);

  screen.getByText("?");
  screen.getByText("This dashboard is looking empty.");
  screen.getByText("Add a question to start making it useful!");
});
