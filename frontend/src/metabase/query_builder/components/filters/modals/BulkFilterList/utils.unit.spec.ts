import { sortDimensions } from "./utils";
import Field from "metabase-lib/lib/metadata/Field";
import { DimensionOption } from "metabase-lib/lib/queries/StructuredQuery";

const mockDimensionOption = (
  semantic_type: string,
  base_type: string,
  text_length: number = 0,
): DimensionOption => {
  const dimension = {
    field: () =>
      new Field({
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
      mockDimensionOption("", "type/Text", 400),
      mockDimensionOption("", "type/Text", 10),
      mockDimensionOption("", "type/Text", 200),
    ].sort(sortDimensions);

    expect(sorted[0].dimension.field().base_type).toBe("type/Text");
    expect(
      sorted[0].dimension.field().fingerprint.type["type/Text"][
        "average-length"
      ],
    ).toBe(10);
    expect(
      sorted[1].dimension.field().fingerprint.type["type/Text"][
        "average-length"
      ],
    ).toBe(400);
  });

  it("should sort title fields before description and comment fields", () => {
    const [first, second, third] = [
      mockDimensionOption("type/Description", "type/Text", 60),
      mockDimensionOption("type/Title", "type/Text", 60),
      mockDimensionOption("type/Comment", "type/Text", 60),
    ].sort(sortDimensions);

    expect(first.dimension.field().semantic_type).toBe("type/Title");
    expect(second.dimension.field().semantic_type).toBe("type/Description");
    expect(third.dimension.field().semantic_type).toBe("type/Comment");
  });
});
