import { renderHook } from "@testing-library/react-hooks";

import {
  createMockActionParameter,
  createMockFieldSettings,
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import useActionForm from "./use-action-form";

describe("useActionForm", () => {
  it("should return initial values", () => {
    const parameter = createMockActionParameter({
      id: "param1",
      type: "string",
    });
    const action = createMockQueryAction({
      parameters: [parameter],
    });

    const { result } = renderHook(() =>
      useActionForm({
        action,
        initialValues: {
          [parameter.id]: "some value",
        },
      }),
    );

    expect(result.current.initialValues).toEqual({
      param1: "some value",
    });
  });

  it("should format initial values", () => {
    const parameter1 = createMockActionParameter({
      id: "param1",
      type: "string/=",
    });
    const parameter2 = createMockActionParameter({
      id: "param2",
      type: "string/=",
    });
    const parameter3 = createMockActionParameter({
      id: "param3",
      type: "string/=",
    });
    const action = createMockQueryAction({
      parameters: [parameter1, parameter2, parameter3],
      visualization_settings: {
        fields: {
          [parameter1.id]: createMockFieldSettings({
            id: parameter1.id,
            inputType: "date",
          }),
          [parameter2.id]: createMockFieldSettings({
            id: parameter2.id,
            inputType: "datetime",
          }),
          [parameter3.id]: createMockFieldSettings({
            id: parameter3.id,
            inputType: "time",
          }),
        },
      },
    });

    const { result } = renderHook(() =>
      useActionForm({
        action,
        initialValues: {
          [parameter1.id]: "2020-05-01T00:00:00+01:00",
          [parameter2.id]: "2020-05-01T00:00:00+01:00",
          [parameter3.id]: "05:25:30+01:00",
        },
      }),
    );
    expect(result.current.initialValues).toEqual({
      param1: "2020-05-01",
      param2: "2020-05-01T00:00:00",
      param3: "05:25:30",
    });
  });

  describe("getCleanValues", () => {
    it("should return initial values if no values passed", () => {
      const parameter = createMockActionParameter({
        id: "param1",
        type: "string",
      });
      const action = createMockQueryAction({
        parameters: [parameter],
        visualization_settings: {
          fields: {
            [parameter.id]: createMockFieldSettings({
              id: parameter.id,
            }),
          },
        },
      });
      const { result } = renderHook(() =>
        useActionForm({
          action,
          initialValues: { param1: "some value" },
        }),
      );
      expect(result.current.getCleanValues()).toEqual({ param1: "some value" });
    });

    it("should return merged values if values passed", () => {
      const parameter = createMockActionParameter({
        id: "param1",
        type: "string",
      });
      const action = createMockQueryAction({
        parameters: [parameter],
        visualization_settings: {
          fields: {
            [parameter.id]: createMockFieldSettings({
              id: parameter.id,
            }),
          },
        },
      });
      const { result } = renderHook(() =>
        useActionForm({
          action,
          initialValues: { param1: "some value" },
        }),
      );
      expect(result.current.getCleanValues({ param1: "new value" })).toEqual({
        param1: "new value",
      });
    });

    it("should filter out unchanged values when prefetching initial values", () => {
      const parameter = createMockActionParameter({
        id: "param1",
        type: "string",
      });
      const action = createMockImplicitQueryAction({
        kind: "row/update",
        parameters: [parameter],
      });
      const { result } = renderHook(() =>
        useActionForm({
          action,
          initialValues: { param1: "some value" },
          prefetchesInitialValues: true,
        }),
      );
      expect(result.current.getCleanValues({ param1: "some value" })).toEqual(
        {},
      );
    });

    it("sholud filter out hidden fields", () => {
      const parameter = createMockActionParameter({
        id: "param1",
        type: "string",
      });
      const parameter2 = createMockActionParameter({
        id: "param2",
        type: "string",
      });
      const action = createMockQueryAction({
        parameters: [parameter, parameter2],
        visualization_settings: {
          fields: {
            [parameter.id]: createMockFieldSettings({
              id: parameter.id,
            }),
            [parameter2.id]: createMockFieldSettings({
              id: parameter2.id,
              hidden: true,
            }),
          },
        },
      });
      const { result } = renderHook(() =>
        useActionForm({
          action,
          initialValues: { param1: "some value", param2: "some value" },
        }),
      );
      expect(result.current.getCleanValues()).toEqual({
        param1: "some value",
      });
    });
  });

  it("should return a form", () => {
    const visibleParameter = createMockActionParameter({
      id: "param1",
      name: "param1",
      type: "string",
    });
    const hiddenParameter = createMockActionParameter({
      id: "param2",
      name: "param2",
      type: "string",
    });
    const action = createMockQueryAction({
      parameters: [visibleParameter, hiddenParameter],
      visualization_settings: {
        fields: {
          [visibleParameter.id]: createMockFieldSettings({
            id: visibleParameter.id,
            order: 2,
          }),
          [hiddenParameter.id]: createMockFieldSettings({
            id: hiddenParameter.id,
            hidden: true,
            order: 1,
          }),
        },
      },
    });

    const { result } = renderHook(() => useActionForm({ action }));

    // check order
    expect(result.current.form.fields[0].name).toBe(hiddenParameter.name);
    expect(result.current.form.fields[1].name).toBe(visibleParameter.name);
  });

  it("should return a correct validation schema", async () => {
    const parameter = createMockActionParameter({
      id: "param1",
      type: "string",
    });
    const parameter2 = createMockActionParameter({
      id: "param2",
      type: "string",
    });
    const fieldSettings = {
      [parameter.id]: createMockFieldSettings({
        id: parameter.id,
        required: false,
      }),
      [parameter2.id]: createMockFieldSettings({
        id: parameter2.id,
        required: true,
        inputType: "number",
      }),
    };

    const action = createMockQueryAction({
      parameters: [parameter, parameter2],
      visualization_settings: {
        fields: fieldSettings,
      },
    });

    const { result } = renderHook(() => useActionForm({ action }));
    const validationSchema = result.current.validationSchema;

    await expect(validationSchema.validateAt("param2", {})).rejects.toThrow(
      "required",
    );
    await expect(
      validationSchema.validateAt("param1", {}),
    ).resolves.not.toThrow();
    await expect(
      validationSchema.validateAt("param2", { param2: 123 }),
    ).resolves.not.toThrow();
  });
});
