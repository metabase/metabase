import { EDIT_TRANSFORM_SCHEMA } from "./UpdateTargetModal";

describe("UpdateTargetModal EDIT_TRANSFORM_SCHEMA (GDGT-2144)", () => {
  describe("when the database supports schemas", () => {
    const context = { supportsSchemas: true };

    it("accepts a non-blank schema", async () => {
      await expect(
        EDIT_TRANSFORM_SCHEMA.validate(
          { name: "t", schema: "public" },
          { context },
        ),
      ).resolves.toBeTruthy();
    });

    it("rejects a null schema", async () => {
      await expect(
        EDIT_TRANSFORM_SCHEMA.validate(
          { name: "t", schema: null },
          { context },
        ),
      ).rejects.toThrow();
    });

    it("rejects an empty-string schema", async () => {
      await expect(
        EDIT_TRANSFORM_SCHEMA.validate({ name: "t", schema: "" }, { context }),
      ).rejects.toThrow();
    });
  });

  describe("when the database does not support schemas", () => {
    const context = { supportsSchemas: false };

    it("accepts a null schema", async () => {
      await expect(
        EDIT_TRANSFORM_SCHEMA.validate(
          { name: "t", schema: null },
          { context },
        ),
      ).resolves.toBeTruthy();
    });
  });
});
