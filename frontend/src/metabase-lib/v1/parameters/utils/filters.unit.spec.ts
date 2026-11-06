import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { TemplateTagDimension } from "metabase-lib/v1/Dimension";
import Field from "metabase-lib/v1/metadata/Field";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { NormalizedField } from "metabase-types/api";
import {
  createMockCard,
  createMockNormalizedField,
  createMockParameter,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { dimensionFilterForParameter } from "./filters";

describe("parameters/utils/field-filters", () => {
  describe("dimensionFilterForParameter", () => {
    const typelessDimension = createMockDimension({
      base_type: "type/*",
      semantic_type: null,
    });

    const CASES: [
      { type: string },
      { name: string; field: Partial<NormalizedField> },
    ][] = [
      [
        { type: "date/single" },
        { name: "date", field: { base_type: "type/DateTime" } },
      ],
      [{ type: "id" }, { name: "id", field: { semantic_type: "type/PK" } }],
      [
        { type: "category" },
        { name: "category", field: { has_field_values: "list" } },
      ],
      [
        { type: "location/city" },
        {
          name: "location",
          field: { base_type: "type/Text", semantic_type: "type/City" },
        },
      ],
      [
        { type: "number/!=" },
        { name: "number", field: { base_type: "type/Integer" } },
      ],
      [
        { type: "string/=" },
        {
          name: "category",
          field: { base_type: "type/Text", has_field_values: "list" },
        },
      ],
      [
        { type: "string/!=" },
        {
          name: "category",
          field: { base_type: "type/Text", has_field_values: "list" },
        },
      ],
      [
        { type: "string/starts-with" },
        { name: "string", field: { base_type: "type/Text" } },
      ],
      [
        { type: "string/=" },
        {
          name: "string-like",
          field: { base_type: "type/TextLike" },
        },
      ],
    ];

    CASES.forEach(([parameter, dimension]) => {
      it(`should return a predicate that evaluates to true for a ${dimension.name} dimension when given a ${parameter.type} parameter`, () => {
        const predicate = dimensionFilterForParameter(
          createMockParameter(parameter),
        );
        expect(predicate(typelessDimension)).toBe(false);
        expect(predicate(createMockDimension(dimension.field))).toBe(true);
      });
    });

    it("should return a predicate that evaluates to true for a coordinate dimension when given a number parameter", () => {
      const coordinateDimension = createMockDimension({
        base_type: "type/Float",
        semantic_type: "type/Latitude",
      });

      const predicate = dimensionFilterForParameter(
        createMockParameter({ type: "number/between" }),
      );
      expect(predicate(coordinateDimension)).toBe(true);
    });

    it("should return a predicate that evaluates to false for a location dimension when given a category parameter", () => {
      const locationDimension = createMockDimension({
        semantic_type: "type/Address",
      });

      const predicate = dimensionFilterForParameter(
        createMockParameter({ type: "category" }),
      );
      expect(predicate(locationDimension)).toBe(false);
    });
  });
});

function createMockDimension(
  field: Partial<NormalizedField>,
): TemplateTagDimension {
  const card = createMockCard({
    dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
      query: "SELECT 1",
    }),
    query_type: "native",
  });
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    questions: [card],
  });
  const question = metadata.question(card.id);
  if (!question) {
    throw new TypeError();
  }
  const dimension = new TemplateTagDimension(
    "tag",
    metadata,
    // `legacyNativeQuery` is typed as the base query class, but a native card's
    // query is always a NativeQuery.
    question.legacyNativeQuery() as NativeQuery,
  );
  return Object.assign(dimension, {
    field: () =>
      new Field(
        createMockNormalizedField({
          base_type: "type/*",
          semantic_type: null,
          has_field_values: "none",
          ...field,
        }),
      ),
  });
}
