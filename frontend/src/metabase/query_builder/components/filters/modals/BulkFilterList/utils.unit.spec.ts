import { sortDimensions } from "./utils";
import Dimension from "metabase-lib/lib/Dimension";
import { DimensionOption } from "metabase-lib/lib/queries/StructuredQuery";

const mockDimensionOption = (
  semantic_type: string,
  base_type: string,
  text_length: number = 0,
): DimensionOption => {
  const dimension = {
    field: () => ({
      semantic_type,
      base_type,
      fingerprint: {
        type: {
          "type/Text": {
            "average-length": text_length,
          },
        },
      },
    }),
  } as any;
  return { dimension } as DimensionOption;
};

describe("sortDimensionOptions", () => {
  it("should sort created-at fields before numbers", () => {
    const sorted = [
      mockDimensionOption("", "type/Float"),
      mockDimensionOption("type/CreationTimestamp", "type/Text"),
      mockDimensionOption("", "type/Float"),
    ].sort(sortDimensions);

    expect(sorted[0].dimension.field().semantic_type).toBe(
      "type/CreationTimestamp",
    );
  });

  it("should sort latitudes before jsons", () => {
    const sorted = [
      mockDimensionOption("", "type/JSON"),
      mockDimensionOption("type/Latitude", "type/Float"),
    ].sort(sortDimensions);

    expect(sorted[0].dimension.field().semantic_type).toBe("type/Latitude");
  });

  it("should sort city before primary key", () => {
    const sorted = [
      mockDimensionOption("type/PK", "type/BigInteger"),
      mockDimensionOption("type/City", "type/Text"),
    ].sort(sortDimensions);

    expect(sorted[0].dimension.field().semantic_type).toBe("type/City");
  });

  it("should sort booleans before categories", () => {
    const sorted = [
      mockDimensionOption("type/Category", "type/Text"),
      mockDimensionOption("", "type/Boolean"),
    ].sort(sortDimensions);

    expect(sorted[0].dimension.field().base_type).toBe("type/Boolean");
  });

  it("should sort short text before long text", () => {
    const sorted = [
      mockDimensionOption("type/LongText", "type/Text", 400),
      mockDimensionOption("type/ShortText", "type/Text", 10),
      mockDimensionOption("type/LongText", "type/Text", 200),
    ].sort(sortDimensions);

    expect(sorted[0].dimension.field().semantic_type).toBe("type/ShortText");
  });
});
