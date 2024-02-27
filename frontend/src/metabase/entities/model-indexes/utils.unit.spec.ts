import Question from "metabase-lib/Question";
import Field from "metabase-lib/metadata/Field";
import type {
  Field as FieldAPI,
  FieldWithMaybeIndex,
} from "metabase-types/api";
import { createMockField, createMockCard } from "metabase-types/api/mocks";

import { canIndexField, cleanIndexFlags } from "./utils";

const createModelWithResultMetadata = (fields: FieldAPI[]) => {
  return new Question(
    createMockCard({ result_metadata: fields, type: "model" }),
  );
};

const createMockFieldWithMaybeIndex = (
  options?: Partial<FieldWithMaybeIndex>,
): FieldAPI => {
  return createMockField(options as Partial<FieldAPI>);
};

describe("Entities > model-indexes > utils", () => {
  describe("canIndexField", () => {
    it("should return true for string field in a model with single integer pk", () => {
      const field = createMockField({ name: "foo", base_type: "type/Text" });

      const model = createModelWithResultMetadata([
        createMockField({ name: "foo", base_type: "type/Text" }),
        createMockField({
          name: "id",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(new Field(field), model)).toBe(true);
    });

    it("should return false for boolean field in a model with single integer pk", () => {
      const field = createMockField({ name: "foo", base_type: "type/Boolean" });

      const model = createModelWithResultMetadata([
        createMockField({ name: "foo", base_type: "type/Boolean" }),
        createMockField({
          name: "id",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(new Field(field), model)).toBe(false);
    });

    it("should return false for string field in a model without any pk", () => {
      const field = createMockField({ name: "foo", base_type: "type/Text" });

      const model = createModelWithResultMetadata([
        createMockField({ name: "foo", base_type: "type/Text" }),
        createMockField({ name: "bar", base_type: "type/Integer" }),
      ]);

      expect(canIndexField(new Field(field), model)).toBe(false);
    });

    it("should return false for string field in a model with multiple pks", () => {
      const field = createMockField({ name: "foo", base_type: "type/String" });

      const model = createModelWithResultMetadata([
        createMockField({ name: "foo", base_type: "type/Boolean" }),
        createMockField({
          name: "id",
          base_type: "type/String",
          semantic_type: "type/PK",
        }),
        createMockField({
          name: "id2",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(new Field(field), model)).toBe(false);
    });

    it("should return false for string field in a model with multiple integer pks", () => {
      const field = createMockField({ name: "foo", base_type: "type/String" });

      const model = createModelWithResultMetadata([
        createMockField({ name: "foo", base_type: "type/Boolean" }),
        createMockField({
          name: "id",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
        createMockField({
          name: "id2",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(new Field(field), model)).toBe(false);
    });

    it("should return false for a model with a string pk", () => {
      const field = createMockField({ name: "foo", base_type: "type/Boolean" });

      const model = createModelWithResultMetadata([
        createMockField({ name: "foo", base_type: "type/Boolean" }),
        createMockField({
          name: "id",
          base_type: "type/String",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(new Field(field), model)).toBe(false);
    });
  });

  describe("cleanIndexFlags", () => {
    it("should remove should_index flag from fields", () => {
      const model = createModelWithResultMetadata([
        createMockFieldWithMaybeIndex({ should_index: true }),
        createMockFieldWithMaybeIndex({ should_index: false }),
        createMockField(),
      ]);

      const cleanedFields = cleanIndexFlags(model.getResultMetadata());

      cleanedFields.forEach((field: any) => {
        expect(field?.should_index).toBeUndefined();
      });
    });

    it("should not mutate the original question", () => {
      const model = createModelWithResultMetadata([
        createMockFieldWithMaybeIndex({ should_index: true }),
        createMockFieldWithMaybeIndex({ should_index: true }),
      ]);

      cleanIndexFlags(model.getResultMetadata());

      model.getResultMetadata().forEach((field: any) => {
        expect(field?.should_index).toBe(true);
      });
    });
  });
});
