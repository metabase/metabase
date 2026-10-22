import { renderWithProviders, screen } from "__support__/ui";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppSummary } from "./DataAppSummary";

describe("DataAppSummary", () => {
  it("renders an enabled app's name as a link to the app", () => {
    renderWithProviders(
      <DataAppSummary
        app={createMockDataApp({ name: "sales", display_name: "Sales" })}
      />,
    );

    const link = screen.getByRole("link", { name: "Sales" });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/apps/sales"),
    );
  });

  it("renders a disabled app's name as plain text (no link)", () => {
    renderWithProviders(
      <DataAppSummary
        app={createMockDataApp({ display_name: "Sales", enabled: false })}
      />,
    );

    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sales" }),
    ).not.toBeInTheDocument();
  });

  it("renders an outdated app's name as plain text (it refuses to open)", () => {
    renderWithProviders(
      <DataAppSummary
        app={createMockDataApp({
          display_name: "Sales",
          enabled: true,
          outdated: true,
        })}
      />,
    );

    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sales" }),
    ).not.toBeInTheDocument();
  });

  describe("description", () => {
    it("renders the description when the app declares one", () => {
      renderWithProviders(
        <DataAppSummary
          app={createMockDataApp({
            display_name: "Sales",
            description: "Pipeline health by region",
          })}
        />,
      );

      expect(screen.getByText("Pipeline health by region")).toBeInTheDocument();
    });

    it("renders nothing extra when the app has no description", () => {
      renderWithProviders(
        <DataAppSummary
          app={createMockDataApp({ display_name: "Sales", description: null })}
        />,
      );

      expect(screen.getByText("Sales")).toBeInTheDocument();
      expect(
        screen.queryByText("Pipeline health by region"),
      ).not.toBeInTheDocument();
    });
  });
});
