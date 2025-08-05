import { render, screen } from "@testing-library/react";
import { t } from "ttag";

import { RunsPage } from "./RunsPage";

describe("RunsPage", () => {
  it("renders the transform runs table with correct headers", () => {
    render(<RunsPage />);

    expect(screen.getByText(t`Transform Runs`)).toBeInTheDocument();
    expect(screen.getByText(t`Transform`)).toBeInTheDocument();
    expect(screen.getByText(t`Start time`)).toBeInTheDocument();
    expect(screen.getByText(t`End time`)).toBeInTheDocument();
    expect(screen.getByText(t`Status`)).toBeInTheDocument();
    expect(screen.getByText(t`Trigger`)).toBeInTheDocument();
  });

  it("renders mock data rows", () => {
    render(<RunsPage />);

    // Check for transform names
    expect(screen.getByText("Daily Sales Summary")).toBeInTheDocument();
    expect(screen.getByText("Customer Data Cleanup")).toBeInTheDocument();
    expect(screen.getByText("Inventory Update")).toBeInTheDocument();

    // Check for status values
    expect(screen.getByText("Successful")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();

    // Check for trigger values
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
});
