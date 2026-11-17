import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { openSaveDialog } from "metabase/utils/dom";
import { defer } from "metabase/utils/promise";

import { AnalyticsExportStatus } from "./AnalyticsExportStatus";
import { CollectionExportAnalytics } from "./CollectionExportAnalytics";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  openSaveDialog: jest.fn(),
}));

const EXPORT_URL = "path:/api/ee/audit-app/analytics-dev/export";

function ExportControls() {
  return (
    <>
      <CollectionExportAnalytics />
      <AnalyticsExportStatus />
    </>
  );
}

function setup() {
  return renderWithProviders(<ExportControls />);
}

describe("AnalyticsExportStatus", () => {
  it("renders nothing before an export starts", () => {
    setup();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("disables the export button while an export is in progress", async () => {
    const request = defer<string>();
    fetchMock.post(EXPORT_URL, () => request.promise);
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Export analytics" }),
    );

    expect(
      await screen.findByText("Exporting analytics content…"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export analytics" }),
    ).toBeDisabled();

    request.resolve("tarball");

    expect(
      await screen.findByText("Analytics content exported"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export analytics" }),
    ).toBeEnabled();
  });

  it("downloads the export using the filename from the response", async () => {
    fetchMock.post(EXPORT_URL, {
      headers: {
        "Content-Disposition": 'attachment; filename="analytics.tar.gz"',
      },
      body: "tarball",
    });
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Export analytics" }),
    );

    expect(
      await screen.findByText("Analytics content exported"),
    ).toBeInTheDocument();
    expect(openSaveDialog).toHaveBeenCalledWith(
      "analytics.tar.gz",
      expect.anything(),
    );
  });

  it("shows an error when the export fails", async () => {
    fetchMock.post(EXPORT_URL, 500);
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Export analytics" }),
    );

    expect(
      await screen.findByText("Error exporting analytics"),
    ).toBeInTheDocument();
    expect(screen.getByText("Export failed")).toBeInTheDocument();
  });

  it("preserves an in-progress export when the controls remount", async () => {
    const request = defer<string>();
    fetchMock.post(EXPORT_URL, () => request.promise);
    const { rerender } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Export analytics" }),
    );
    expect(
      await screen.findByText("Exporting analytics content…"),
    ).toBeInTheDocument();

    rerender(<></>);
    rerender(<ExportControls />);

    expect(
      screen.getByRole("button", { name: "Export analytics" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Exporting analytics content…"),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.calls(EXPORT_URL)).toHaveLength(1);

    request.resolve("tarball");

    expect(
      await screen.findByText("Analytics content exported"),
    ).toBeInTheDocument();
  });

  it("allows another export after dismissing the result", async () => {
    fetchMock.post(EXPORT_URL, { body: "tarball" });
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Export analytics" }),
    );
    expect(
      await screen.findByText("Analytics content exported"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Export analytics" }),
    );

    expect(
      await screen.findByText("Analytics content exported"),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.calls(EXPORT_URL)).toHaveLength(2);
  });
});
