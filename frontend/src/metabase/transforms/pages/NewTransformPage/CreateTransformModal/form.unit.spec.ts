import { VALIDATION_SCHEMA } from "./form";

// Full valid form payload; individual tests override only the fields they care about.
const baseValues = {
  name: "My Transform",
  targetName: "my_target_table",
  targetSchema: "public",
  collection_id: null,
  incremental: false,
  sourceStrategy: "checkpoint" as const,
  checkpointFilterFieldId: null,
  targetStrategy: "append" as const,
};

describe("CreateTransformModal VALIDATION_SCHEMA (GDGT-2144)", () => {
  describe("when the database supports schemas", () => {
    const context = { supportsSchemas: true };

    it("accepts a non-blank targetSchema", async () => {
      await expect(
        VALIDATION_SCHEMA.validate(baseValues, { context }),
      ).resolves.toBeTruthy();
    });

    it("rejects a null targetSchema", async () => {
      await expect(
        VALIDATION_SCHEMA.validate(
          { ...baseValues, targetSchema: null },
          { context },
        ),
      ).rejects.toThrow();
    });

    it("rejects an empty-string targetSchema", async () => {
      await expect(
        VALIDATION_SCHEMA.validate(
          { ...baseValues, targetSchema: "" },
          { context },
        ),
      ).rejects.toThrow();
    });
  });

  describe("when the database does not support schemas", () => {
    const context = { supportsSchemas: false };

    it("accepts a null targetSchema", async () => {
      await expect(
        VALIDATION_SCHEMA.validate(
          { ...baseValues, targetSchema: null },
          { context },
        ),
      ).resolves.toBeTruthy();
    });

    it("accepts a non-null targetSchema", async () => {
      await expect(
        VALIDATION_SCHEMA.validate(baseValues, { context }),
      ).resolves.toBeTruthy();
    });
  });
});
