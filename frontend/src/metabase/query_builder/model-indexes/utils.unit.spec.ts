import Question from "metabase-lib/v1/Question";
import type { DatasetColumn } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockNormalizedField,
} from "metabase-types/api/mocks";

import { canIndexField } from "./utils";

const createModelWithResultMetadata = (fields: DatasetColumn[]) => {
  return new Question(
    createMockCard({ result_metadata: fields, type: "model" }),
  );
};

describe("Entities > model-indexes > utils", () => {
  describe("canIndexField", () => {
    it("should return true for string field in a model with single integer pk", () => {
      const field = createMockNormalizedField({
        name: "foo",
        base_type: "type/Text",
      });

      const model = createModelWithResultMetadata([
        createMockColumn({ name: "foo", base_type: "type/Text" }),
        createMockColumn({
          name: "id",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(field, model)).toBe(true);
    });

    it("should return false for boolean field in a model with single integer pk", () => {
      const field = createMockNormalizedField({
        name: "foo",
        base_type: "type/Boolean",
      });

      const model = createModelWithResultMetadata([
        createMockColumn({ name: "foo", base_type: "type/Boolean" }),
        createMockColumn({
          name: "id",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(field, model)).toBe(false);
    });

    it("should return false for string field in a model without any pk", () => {
      const field = createMockNormalizedField({
        name: "foo",
        base_type: "type/Text",
      });

      const model = createModelWithResultMetadata([
        createMockColumn({ name: "foo", base_type: "type/Text" }),
        createMockColumn({ name: "bar", base_type: "type/Integer" }),
      ]);

      expect(canIndexField(field, model)).toBe(false);
    });

    it("should return false for string field in a model with multiple pks", () => {
      const field = createMockNormalizedField({
        name: "foo",
        base_type: "type/String",
      });

      const model = createModelWithResultMetadata([
        createMockColumn({ name: "foo", base_type: "type/Boolean" }),
        createMockColumn({
          name: "id",
          base_type: "type/String",
          semantic_type: "type/PK",
        }),
        createMockColumn({
          name: "id2",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(field, model)).toBe(false);
    });

    it("should return false for string field in a model with multiple integer pks", () => {
      const field = createMockNormalizedField({
        name: "foo",
        base_type: "type/String",
      });

      const model = createModelWithResultMetadata([
        createMockColumn({ name: "foo", base_type: "type/Boolean" }),
        createMockColumn({
          name: "id",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
        createMockColumn({
          name: "id2",
          base_type: "type/Integer",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(field, model)).toBe(false);
    });

    it("should return false for a model with a string pk", () => {
      const field = createMockNormalizedField({
        name: "foo",
        base_type: "type/Boolean",
      });

      const model = createModelWithResultMetadata([
        createMockColumn({ name: "foo", base_type: "type/Boolean" }),
        createMockColumn({
          name: "id",
          base_type: "type/String",
          semantic_type: "type/PK",
        }),
      ]);

      expect(canIndexField(field, model)).toBe(false);
    });
  });
});
