import fetchMock from "fetch-mock";

import {
  setupTablePublishingInfoEndpoint,
  setupTablePublishingInfoEndpointError,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen } from "__support__/ui";
import { Card } from "metabase/ui";
import type { TablePublishingInfo } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { PublishingInfo } from "./PublishingInfo";

const PUBLISHING_INFO: TablePublishingInfo = {
  published_at: "2026-08-26T12:00:00Z",
  published_by: {
    id: 1,
    common_name: "Bobby Tables",
  },
};

function setup({
  isPublished = true,
  publishingInfo = PUBLISHING_INFO,
  isError = false,
}: {
  isPublished?: boolean;
  publishingInfo?: TablePublishingInfo | null;
  isError?: boolean;
} = {}) {
  const table = createMockTable({ is_published: isPublished });
  if (isError) {
    setupTablePublishingInfoEndpointError(table.id);
  } else {
    setupTablePublishingInfoEndpoint(table.id, publishingInfo);
  }

  renderWithProviders(
    <Card>
      <PublishingInfo table={table} />
    </Card>,
  );

  return { table };
}

describe("PublishingInfo", () => {
  it("shows when and by whom the table was published", async () => {
    setup();

    expect(
      await screen.findByTestId("table-publishing-date"),
    ).not.toBeEmptyDOMElement();
    expect(screen.getByText(/by Bobby Tables/)).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("shows the publication date when the publisher is unavailable", async () => {
    setup({
      publishingInfo: {
        ...PUBLISHING_INFO,
        published_by: null,
      },
    });

    expect(
      await screen.findByTestId("table-publishing-date"),
    ).not.toBeEmptyDOMElement();
    expect(screen.queryByText(/by /)).not.toBeInTheDocument();
  });

  it("does not show publishing information when there is no publishing event", async () => {
    setup({ publishingInfo: null });

    await act(async () => {
      await fetchMock.callHistory.flush(true);
    });
    expect(screen.queryByText("Published")).not.toBeInTheDocument();
  });

  it("does not show publishing information when it cannot be loaded", async () => {
    setup({ isError: true });

    await act(async () => {
      await fetchMock.callHistory.flush(true);
    });
    expect(screen.queryByText("Published")).not.toBeInTheDocument();
  });

  it("does not request or show publishing information for an unpublished table", () => {
    const { table } = setup({ isPublished: false });

    expect(
      fetchMock.callHistory.calls(
        `path:/api/ee/data-studio/table/${table.id}/publishing-info`,
      ),
    ).toHaveLength(0);
    expect(screen.queryByText("Published")).not.toBeInTheDocument();
  });
});
