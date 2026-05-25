import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";

import { DimensionPillBar } from "./DimensionPillBar";

describe("DimensionPillBar", () => {
  it("renders column labels as non-interactive icon and text labels", async () => {
    renderWithProviders(
      <DimensionPillBar
        items={[
          {
            type: "metric",
            id: 1,
            label: "Created At",
            icon: "calendar",
            availableOptions: [],
          },
          {
            type: "expression",
            id: 2,
            label: "Order Date",
            icon: "calendar",
            metricSources: [],
          },
        ]}
      />,
    );

    expect(screen.getByText("Created At")).toBeInTheDocument();
    expect(screen.getByText("Order Date")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Created At"));

    expect(screen.queryByText("Remove dimension")).not.toBeInTheDocument();
    expect(screen.queryByText("Select a dimension")).not.toBeInTheDocument();
  });
});
