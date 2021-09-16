import { adjustPositions, stripRemarks } from "metabase/query_builder/components/DataSelector";

describe("VisualizationError", () => {
  const remarkedQuery = "";

  it("should strip remarks from query with stripRemarks", () => {
    expect(stripRemarks(remarkedQuery)).toEqual("some shit");
  });
});
