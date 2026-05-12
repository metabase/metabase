import { type IncrementalSettingsFormValues, VALIDATION_SCHEMA } from "./form";

const getValues = (
  values: Partial<IncrementalSettingsFormValues> = {},
): IncrementalSettingsFormValues => ({
  incremental: true,
  sourceStrategy: "checkpoint",
  checkpointFilterFieldId: "123",
  targetStrategy: "append",
  ...values,
});

describe("IncrementalTransform form validation", () => {
  it("requires checkpoint field for incremental transforms", async () => {
    const values = getValues({ checkpointFilterFieldId: null });

    await expect(VALIDATION_SCHEMA.validate(values)).rejects.toMatchObject({
      message: "required",
    });
  });

  it("accepts checkpoint field when incremental transforms are enabled", async () => {
    const values = getValues({ checkpointFilterFieldId: "42" });

    await expect(VALIDATION_SCHEMA.validate(values)).resolves.toEqual(values);
  });

  it("does not require checkpoint field when incremental transforms are disabled", async () => {
    const values = getValues({
      incremental: false,
      checkpointFilterFieldId: null,
    });

    await expect(VALIDATION_SCHEMA.validate(values)).resolves.toEqual(values);
  });
});
