import type { PythonTransformSource } from "metabase-types/api";

import {
  type NewTransformValues,
  VALIDATION_SCHEMA,
  convertTransformFormToCreateRequest,
} from "./form";

// Full valid form payload; individual tests override only the fields they care about.
const baseValues = {
  name: "My Transform",
  targetName: "my_target_table",
  targetSchema: "public",
  collection_id: null,
  incremental: false,
  sourceStrategy: "checkpoint" as const,
  checkpointFilterFieldId: null,
  uniqueKey: "",
};

const DATABASE_ID = 1;

const createPythonSource = (
  opts: Partial<PythonTransformSource> = {},
): PythonTransformSource => ({
  type: "python",
  body: "def transform(): ...",
  "source-database": DATABASE_ID,
  "source-tables": [],
  ...opts,
});

const createFormValues = (
  secrets: NewTransformValues["secrets"],
): NewTransformValues => ({
  ...baseValues,
  lookbackValue: null,
  lookbackUnit: "day",
  secrets,
});

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

  describe("secrets", () => {
    const context = { supportsSchemas: true };

    it("accepts half-filled rows, which are dropped on submit", async () => {
      await expect(
        VALIDATION_SCHEMA.validate(
          {
            ...baseValues,
            secrets: [
              { name: "", value: "abc" },
              { name: "GITHUB_TOKEN", value: "" },
            ],
          },
          { context },
        ),
      ).resolves.toBeTruthy();
    });

    it("rejects a filled row with an invalid name", async () => {
      await expect(
        VALIDATION_SCHEMA.validate(
          {
            ...baseValues,
            secrets: [{ name: "github token", value: "abc" }],
          },
          { context },
        ),
      ).rejects.toThrow();
    });
  });
});

describe("convertTransformFormToCreateRequest secrets", () => {
  const ingestionSource = createPythonSource({ ingestion: true });

  it("includes only the fully filled secrets", () => {
    const request = convertTransformFormToCreateRequest(
      ingestionSource,
      createFormValues([
        { name: " GITHUB_TOKEN ", value: "ghp_1" },
        { name: "", value: "orphan" },
        { name: "API_KEY", value: "" },
      ]),
      DATABASE_ID,
    );

    expect(request.secrets).toEqual({ GITHUB_TOKEN: "ghp_1" });
  });

  it("omits secrets when there is no valid pair", () => {
    const request = convertTransformFormToCreateRequest(
      ingestionSource,
      createFormValues([{ name: "API_KEY", value: "" }]),
      DATABASE_ID,
    );

    expect(request).not.toHaveProperty("secrets");
  });

  it("omits secrets for non-ingestion sources", () => {
    const request = convertTransformFormToCreateRequest(
      createPythonSource(),
      createFormValues([{ name: "API_KEY", value: "abc" }]),
      DATABASE_ID,
    );

    expect(request).not.toHaveProperty("secrets");
  });
});
