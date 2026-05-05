import type {
  FieldSettingsMap,
  InputSettingType,
  ParameterType,
} from "metabase-types/api";
import {
  createMockFieldSettings,
  createMockParameter,
} from "metabase-types/api/mocks";

import {
  formatInitialValue,
  formatSubmitValues,
  generateFieldSettingsFromParameters,
  getInputType,
  getOrGenerateFieldSettings,
  stripTZInfo,
} from "./utils";

const getFirstEntry = (obj: any): any => {
  return Object.entries(obj)[0];
};

describe("actions > containers > ActionParametersInputForm > utils", () => {
  describe("stripTZInfo", () => {
    it("should strip timezone info from dateTimes", () => {
      const result = stripTZInfo("2020-05-01T03:30:00-02:00");
      expect(result.format()).toEqual("2020-05-01T03:30:00Z");
    });

    it("should strip timezone info from times", () => {
      const result = stripTZInfo("2020-05-01T03:30:00+08:00");
      expect(result.format()).toEqual("2020-05-01T03:30:00Z");
    });

    it("should not do anything to strings without time info", () => {
      const result = stripTZInfo("2020-05-01");
      expect(result.format()).toEqual("2020-05-01T00:00:00Z");
    });

    it("should not do anything to strings without timezone info", () => {
      const result = stripTZInfo("2020-05-01T03:30:00");
      expect(result.format()).toEqual("2020-05-01T03:30:00Z");
    });
  });

  describe("formatInitialValue", () => {
    it("ignores null values", () => {
      const result = formatInitialValue(null);
      expect(result).toEqual(null);
    });

    it("ignores numeric values", () => {
      const result = formatInitialValue(123);
      expect(result).toEqual(123);
    });

    it("ignores string values", () => {
      const result = formatInitialValue("123");
      expect(result).toEqual("123");
    });

    const timezones = ["-02:00", "-07:00", "+01:00", "+09:00"];

    timezones.forEach((offset) => {
      describe(`with timezone ${offset}`, () => {
        it("formats dates", () => {
          const result = formatInitialValue(
            `2020-05-01T00:00:00${offset}`,
            "date",
          );
          expect(result).toEqual("2020-05-01");
        });

        it("formats datetimes", () => {
          const result = formatInitialValue(
            `2020-05-01T05:00:00${offset}`,
            "datetime",
          );
          expect(result).toEqual("2020-05-01T05:00:00");
        });

        it("formats times", () => {
          const result = formatInitialValue(`05:25:30${offset}`, "time");
          expect(result).toEqual("05:25:30");
        });
      });
    });
  });

  describe("getInputType", () => {
    it.each<{
      parameterType: ParameterType;
      expectedInputType: InputSettingType;
    }>([
      { parameterType: "string", expectedInputType: "string" },
      { parameterType: "string/=", expectedInputType: "string" },
      { parameterType: "number", expectedInputType: "number" },
      { parameterType: "number/=", expectedInputType: "number" },
      { parameterType: "boolean", expectedInputType: "boolean" },
      { parameterType: "boolean/=", expectedInputType: "boolean" },
      { parameterType: "date", expectedInputType: "datetime" },
      { parameterType: "date/all-options", expectedInputType: "datetime" },
      { parameterType: "category", expectedInputType: "string" },
    ])(
      "should get the input type for $parameterType parameterType",
      ({ parameterType, expectedInputType }) => {
        const parameter = createMockParameter({ type: parameterType });
        expect(getInputType(parameter)).toBe(expectedInputType);
      },
    );
  });

  describe("generateFieldSettingsFromParameters", () => {
    it("should generate settings for a string field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "string" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("string");
    });

    it("should generate settings for an Integer field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "number" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("should generate settings for a float field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "number" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("generates field settings for an integer field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "number" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("should generate settings for a dateTime field", () => {
      const params = [createMockParameter({ id: "test-field", type: "date" })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("datetime");
    });

    it("should generate settings for a date field", () => {
      const params = [createMockParameter({ id: "test-field", type: "date" })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("datetime");
    });

    it("generates field settings for a json field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "string" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("string");
    });

    it("should set the parameter id as the object key", () => {
      const params = [createMockParameter({ id: "test-field" })];
      const [id, _settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(id).toEqual("test-field");
    });

    it("should get title and placeholder from the parameter", () => {
      const params = [
        createMockParameter({ id: "test-field", "display-name": "Test Field" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.placeholder).toBe("Test Field");
      expect(settings.title).toBe("Test Field");
    });

    it("sets required prop to true", () => {
      const params = [
        createMockParameter({ id: "test-field", required: true }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.required).toBe(true);
    });

    it("sets required prop to false", () => {
      const params = [
        createMockParameter({ id: "test-field", required: false }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.required).toBe(false);
    });
  });

  describe("getOrGenerateFieldSettings", () => {
    describe("when only parameters passed", () => {
      it("generates settings with generateFieldSettingsFromParameters", () => {
        const params = [
          createMockParameter({ id: "test-field", required: false }),
        ];

        expect(getOrGenerateFieldSettings(params)).toEqual(
          generateFieldSettingsFromParameters(params),
        );
      });
    });

    describe("when fields have only BE generated keys (hidden and id)", () => {
      it("generates settings with generateFieldSettingsFromParameters and overrides 'hidden'", () => {
        const id = "test-id";
        const params = [createMockParameter({ id })];
        let HIDDEN = true;
        let fields = {
          [id]: { id, hidden: HIDDEN },
        };
        const [, hiddenSettings] = getFirstEntry(
          getOrGenerateFieldSettings(params, fields),
        );

        expect(hiddenSettings.hidden).toBe(HIDDEN);

        HIDDEN = false;
        fields = {
          [id]: { id, hidden: HIDDEN },
        };
        const [, notHiddenSettings] = getFirstEntry(
          getOrGenerateFieldSettings(params, fields),
        );

        expect(notHiddenSettings.hidden).toBe(HIDDEN);
      });
    });

    describe("when fields are fulfilled", () => {
      it("returns fields", () => {
        const params = [createMockParameter({ id: "test-field" })];
        const id = "test-id";
        const fields = {
          [id]: createMockFieldSettings({ id, hidden: true }),
        };

        expect(getOrGenerateFieldSettings(params, fields)).toBe(fields);
      });
    });
  });

  describe("formatSubmitValues", () => {
    it("should format numeric field values as numbers", () => {
      const fieldSettings: FieldSettingsMap = {
        field_1: createMockFieldSettings({ fieldType: "number" }),
        field_2: createMockFieldSettings({ fieldType: "string" }),
      };
      const rawValues = {
        field_1: "1",
        field_2: "some string",
      };
      const expected = {
        field_1: 1,
        field_2: "some string",
      };
      expect(formatSubmitValues(rawValues, fieldSettings)).toEqual(expected);
    });

    it("should not format non-numeric field values", () => {
      const fieldSettings: FieldSettingsMap = {
        field_1: createMockFieldSettings({ fieldType: "string" }),
      };
      const rawValues = {
        field_1: "some string",
      };
      const expected = {
        field_1: "some string",
      };

      expect(formatSubmitValues(rawValues, fieldSettings)).toEqual(expected);
    });

    it("should not format hidden field values", () => {
      const fieldSettings: FieldSettingsMap = {
        field_1: createMockFieldSettings({ fieldType: "number", hidden: true }),
        field_2: createMockFieldSettings({
          fieldType: "string",
          hidden: false,
        }),
      };
      const rawValues = {
        field_1: "1",
        field_2: "2",
      };
      const expected = {
        field_2: "2",
      };

      expect(formatSubmitValues(rawValues, fieldSettings)).toEqual(expected);
    });
  });
});
