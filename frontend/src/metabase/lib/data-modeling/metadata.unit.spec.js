import { getDatasetMetadataCompletenessPercentage } from "./metadata";

describe("getDatasetMetadataCompletenessPercentage", () => {
  it("returns 0 when no field metadata list is empty", () => {
    expect(getDatasetMetadataCompletenessPercentage([])).toBe(0);
  });

  it("returns 0 for completely missing metadata", () => {
    const percent = getDatasetMetadataCompletenessPercentage([
      { name: "Created_At" },
      { name: "Products → Category" },
    ]);
    expect(percent).toBe(0);
  });

  it("returns 1 for complete metadata", () => {
    const percent = getDatasetMetadataCompletenessPercentage([
      {
        name: "Created At",
        description: "Date created",
        semantic_type: "DateTime",
      },
      {
        name: "Product Category",
        description: "The name is pretty self-explaining",
        semantic_type: "String",
      },
    ]);
    expect(percent).toBe(1);
  });

  it("returns 0.5 for half-complete metadata", () => {
    const percent = getDatasetMetadataCompletenessPercentage([
      { name: "Created_At" },
      {
        name: "Product Category",
        description: "The name is pretty self-explaining",
        semantic_type: "String",
      },
    ]);
    expect(percent).toBe(0.5);
  });

  it("returns percent value for partially complete metadata", () => {
    const percent = getDatasetMetadataCompletenessPercentage([
      { name: "Created_At" },
      {
        name: "Product Category",
        semantic_type: "String",
      },
    ]);
    expect(percent).toBe(0.33);
  });
});
