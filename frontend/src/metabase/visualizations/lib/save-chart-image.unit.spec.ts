import { getChartImageBlob } from "./save-chart-image";

describe("getChartImageBlob", () => {
  it("returns null when the chart is not in the DOM", async () => {
    const blob = await getChartImageBlob({
      selector: "#missing-chart",
      includeBranding: false,
    });

    expect(blob).toBeNull();
  });
});
