import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createMockDataset } from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../../test-utils";

import {
  NotebookStepPreview,
  VisualizationPreview,
} from "./NotebookStepPreview";

registerVisualizations();

const PREVIEW_ROWS_LIMIT = 10;

function createStepWithLimit(limit: number | null) {
  let previewQuery = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });
  if (limit !== null) {
    previewQuery = Lib.limit(previewQuery, 0, limit);
  }
  return createMockNotebookStep({ previewQuery, stageIndex: 0 });
}

async function getPreviewRequestLimit(limit: number | null) {
  setupCardDataset();
  renderWithProviders(
    <NotebookStepPreview
      step={createStepWithLimit(limit)}
      onClose={jest.fn()}
    />,
  );

  await waitFor(() => {
    expect(fetchMock.callHistory.lastCall("path:/api/dataset")).toBeTruthy();
  });

  const request = fetchMock.callHistory.lastCall("path:/api/dataset")?.request;
  const body = await request?.json();
  return body.stages[0].limit;
}

describe("NotebookStepPreview - preview row limit (metabase#29959)", () => {
  it("caps an unlimited preview query at the preview row limit", async () => {
    expect(await getPreviewRequestLimit(null)).toBe(PREVIEW_ROWS_LIMIT);
  });

  it("keeps a user limit smaller than the preview row limit", async () => {
    expect(await getPreviewRequestLimit(5)).toBe(5);
  });

  it("caps a user limit larger than the preview row limit", async () => {
    expect(await getPreviewRequestLimit(50)).toBe(PREVIEW_ROWS_LIMIT);
  });
});

describe("VisualizationPreview", () => {
  it("should render an error message when an error occurs (metabase#40724)", () => {
    renderWithProviders(
      <VisualizationPreview
        rawSeries={null}
        result={null}
        error={{ status: 0 }}
      />,
    );
    expect(screen.getByText("Could not fetch preview")).toBeInTheDocument();
  });

  it("should render a custom error message when an error occurs (metabase#40724)", () => {
    const message = "This is a custom message";
    renderWithProviders(
      <VisualizationPreview
        rawSeries={null}
        result={null}
        error={{ message }}
      />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("should render an error message when an error is passed from the results (metabase#40724)", () => {
    const message = "This is a custom message";
    renderWithProviders(
      <VisualizationPreview
        rawSeries={null}
        result={createMockDataset({ error: message })}
        error={null}
      />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
