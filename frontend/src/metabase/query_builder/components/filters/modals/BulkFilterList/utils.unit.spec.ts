import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import {
  createMockField,
  createMockTextFieldFingerprint,
} from "metabase-types/api/mocks";
import type { Field } from "metabase-types/api";
import { DimensionOption } from "metabase-lib/queries/StructuredQuery";
import { sortDimensions } from "./utils";

function createTextField({
  avgLength,
  ...opts
}: Partial<Omit<Field, "fingerprint">> & { avgLength: number }) {
  return createMockField({
    base_type: "type/Text",
    semantic_type: null,
    ...opts,
    fingerprint: {
      type: {
        "type/Text": createMockTextFieldFingerprint({
          "average-length": avgLength,
        }),
      },
    },
  });
}

function setup(fields: Field[]): DimensionOption[] {
  const metadata = createMockMetadata({ fields });
  const fieldInstances = fields.map(field =>
    checkNotNull(metadata.field(field.id)),
  );
  const dimensions = fieldInstances.map(field => field.dimension());
  return dimensions.map(dimension => ({ dimension }));
}

describe("sortDimensionOptions", () => {
  it("should sort created-at fields before numbers", () => {
    const options = setup([
      createMockField({ id: 1, base_type: "type/Float", semantic_type: null }),
      createMockField({
        id: 2,
        base_type: "type/Text",
        semantic_type: "type/CreationTimestamp",
      }),
      createMockField({ id: 3, base_type: "type/Float", semantic_type: null }),
    ]);

    const sorted = options.sort(sortDimensions);

    expect(sorted[0].dimension.field().semantic_type).toBe(
      "type/CreationTimestamp",
    );
  });

  it("should sort latitudes before jsons", () => {
    const options = setup([
      createMockField({ id: 1, base_type: "type/JSON", semantic_type: null }),
      createMockField({
        id: 2,
        base_type: "type/Float",
        semantic_type: "type/Latitude",
      }),
    ]);

    const sorted = options.sort(sortDimensions);

    expect(sorted[0].dimension.field().semantic_type).toBe("type/Latitude");
  });

  it("should sort city before primary key", () => {
    const options = setup([
      createMockField({
        id: 1,
        base_type: "type/BigInteger",
        semantic_type: "type/PK",
      }),
      createMockField({
        id: 2,
        base_type: "type/Text",
        semantic_type: "type/City",
      }),
    ]);

    const sorted = options.sort(sortDimensions);

    expect(sorted[0].dimension.field().semantic_type).toBe("type/City");
  });

  it("should sort booleans before categories", () => {
    const options = setup([
      createMockField({
        id: 1,
        base_type: "type/Text",
        semantic_type: "type/Category",
      }),
      createMockField({
        id: 2,
        base_type: "type/Boolean",
        semantic_type: null,
      }),
    ]);

    const sorted = options.sort(sortDimensions);

    expect(sorted[0].dimension.field().base_type).toBe("type/Boolean");
  });

  it("should sort short text before long text", () => {
    const options = setup([
      createTextField({ id: 1, avgLength: 400 }),
      createTextField({ id: 2, avgLength: 10 }),
      createTextField({ id: 3, avgLength: 200 }),
    ]);

    const sorted = options.sort(sortDimensions);
    const field1 = sorted[0].dimension.field();
    const field2 = sorted[1].dimension.field();

    expect(field1.fingerprint?.type?.["type/Text"]?.["average-length"]).toBe(
      10,
    );
    expect(field2.fingerprint?.type?.["type/Text"]?.["average-length"]).toBe(
      400,
    );
  });

  it("should sort title fields before description and comment fields", () => {
    const options = setup([
      createTextField({
        id: 1,
        semantic_type: "type/Description",
        avgLength: 60,
      }),
      createTextField({ id: 2, semantic_type: "type/Title", avgLength: 60 }),
      createTextField({ id: 3, semantic_type: "type/Comment", avgLength: 60 }),
    ]);

    const [first, second, third] = options.sort(sortDimensions);

    expect(first.dimension.field().semantic_type).toBe("type/Title");
    expect(second.dimension.field().semantic_type).toBe("type/Description");
    expect(third.dimension.field().semantic_type).toBe("type/Comment");
  });
});
