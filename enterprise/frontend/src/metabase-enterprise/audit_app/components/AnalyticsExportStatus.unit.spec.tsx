import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { openSaveDialog } from "metabase/utils/dom";

import { AnalyticsExportStatus } from "./AnalyticsExportStatus";
import { CollectionExportAnalytics } from "./CollectionExportAnalytics";

jest.mock("metabase/utils/dom", () => ({
  ...jest.requireActual("metabase/utils/dom"),
  openSaveDialog: jest.fn(),
}));

const EXPORT_URL = "path:/api/ee/audit-app/analytics-dev/export";

const setup = () => {
  renderWithProviders(
    <>
      <CollectionExportAnalytics />
      <AnalyticsExportStatus />
    </>,
  );
};

describe("AnalyticsExportStatus", () => {
  it("renders nothing before an export starts", () => {
    setup();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("tracks an export through loading, success, and dismissal", async () => {
    let resolveExport = (_response: unknown) => {};
    fetchMock.post(
      EXPORT_URL,
      () =>
        new Promise<unknown>((resolve) => {
          resolveExport = resolve;
        }),
    );

    setup();

    await userEvent.click(screen.getByLabelText("Export analytics"));

    expect(
      await screen.findByText("Exporting analytics content…"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Export analytics")).toBeDisabled();

    resolveExport({
      status: 200,
      headers: {
        "Content-Disposition": 'attachment; filename="analytics.tar.gz"',
      },
      body: "tarball",
    });

    expect(
      await screen.findByText("Analytics content exported"),
    ).toBeInTheDocument();
    // The response body is a whatwg-fetch polyfill Blob in jest,
    // so match on the parsed filename only.
    expect(openSaveDialog).toHaveBeenCalledWith(
      "analytics.tar.gz",
      expect.anything(),
    );
    expect(screen.getByLabelText("Export analytics")).toBeEnabled();

    await userEvent.click(screen.getByLabelText("Dismiss"));

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("shows the error state when the export fails", async () => {
    fetchMock.post(EXPORT_URL, 500);

    setup();

    await userEvent.click(screen.getByLabelText("Export analytics"));

    expect(
      await screen.findByText("Error exporting analytics"),
    ).toBeInTheDocument();
    expect(screen.getByText("Export failed")).toBeInTheDocument();
  });
});
