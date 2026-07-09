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

  describe("sync status", () => {
    it("shows the short synced SHA when the app has synced", () => {
      renderWithProviders(
        <DataAppSummary
          app={createMockDataApp({
            last_synced_sha: "0123456789abcdef",
            sync_error: null,
          })}
        />,
      );

      expect(screen.getByText("Synced 0123456")).toBeInTheDocument();
    });

    it("shows a failure label with the error as a tooltip when the sync failed", () => {
      renderWithProviders(
        <DataAppSummary
          app={createMockDataApp({ sync_error: "boom: bad manifest" })}
        />,
      );

      const status = screen.getByText("Sync failed");
      expect(status).toBeInTheDocument();
      expect(status).toHaveAttribute("title", "boom: bad manifest");
    });

    it("prefers the failure label over the SHA when both are present", () => {
      renderWithProviders(
        <DataAppSummary
          app={createMockDataApp({
            last_synced_sha: "0123456789abcdef",
            sync_error: "boom",
          })}
        />,
      );

      expect(screen.getByText("Sync failed")).toBeInTheDocument();
      expect(screen.queryByText(/^Synced/)).not.toBeInTheDocument();
    });

    it("shows 'Not synced yet' when the app has never synced", () => {
      renderWithProviders(
        <DataAppSummary
          app={createMockDataApp({ last_synced_sha: null, sync_error: null })}
        />,
      );

      expect(screen.getByText("Not synced yet")).toBeInTheDocument();
    });
  });
});
