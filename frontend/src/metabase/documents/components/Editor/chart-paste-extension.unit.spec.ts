import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import type { createDraftCard } from "metabase/documents/documents.slice";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { materializePastedChart } from "./chart-paste-extension";

const datasetQuery = createMockStructuredDatasetQuery();

const chartText = serializeChartClipboard({
  name: "Orders by month",
  display: "bar",
  dataset_query: datasetQuery,
  visualization_settings: {},
});

describe("materializePastedChart", () => {
  it("registers a draft card and returns a cardEmbed node for a pasted chart", () => {
    const dispatch: jest.Mock<void, [ReturnType<typeof createDraftCard>]> =
      jest.fn();

    const node = materializePastedChart(chartText, dispatch);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const { payload } = dispatch.mock.calls[0][0];
    expect(payload.originalCard).toEqual(
      expect.objectContaining({
        name: "Orders by month",
        display: "bar",
        dataset_query: datasetQuery,
        type: "question",
      }),
    );
    expect(payload.draftId).toBeLessThan(0);
    expect(node).toEqual({
      type: "resizeNode",
      content: [{ type: "cardEmbed", attrs: { id: payload.draftId } }],
    });
  });

  it("returns null and dispatches nothing for non-chart clipboard content", () => {
    const dispatch: jest.Mock<void, [ReturnType<typeof createDraftCard>]> =
      jest.fn();

    expect(materializePastedChart("just some text", dispatch)).toBeNull();
    expect(materializePastedChart(undefined, dispatch)).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
