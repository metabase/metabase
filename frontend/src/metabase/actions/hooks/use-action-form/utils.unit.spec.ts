import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import type { FieldSettingsMap } from "metabase-types/api";
import {
  createMockField,
  createMockFieldSettings,
  createMockParameter,
} from "metabase-types/api/mocks";

import {
  formatInitialValue,
  getInputType,
  generateFieldSettingsFromParameters,
  stripTZInfo,
  getOrGenerateFieldSettings,
  formatSubmitValues,
} from "./utils";

const getFirstEntry = (obj: any): any => {
  return Object.entries(obj)[0];
};

const STRING_FK_FIELD_ID = 1;
const INT_FK_FIELD_ID = 2;
const BOOLEAN_FIELD_ID = 3;
const FLOAT_FIELD_ID = 4;
const CATEGORY_FIELD_ID = 5;
const LONG_TEXT_FIELD_ID = 6;

const DATE_FIELD_ID = 100;
const DATETIME_FIELD_ID = 101;
const DATETIME_LOCAL_TZ_FIELD_ID = 102;
const TIME_FIELD_ID = 103;
const TIME_LOCAL_TZ_FIELD_ID = 104;

describe("actions > containers > ActionParametersInputForm > utils", () => {
  const dateTimeFields = [
    { id: DATE_FIELD_ID, base_type: "type/Date" },
    { id: DATETIME_FIELD_ID, base_type: "type/DateTime" },
    { id: DATETIME_LOCAL_TZ_FIELD_ID, base_type: "type/DateTimeWithLocalTZ" },
    { id: TIME_FIELD_ID, base_type: "type/Time" },
    { id: TIME_LOCAL_TZ_FIELD_ID, base_type: "type/TimeWithLocalTZ" },
  ].map(({ id, base_type }) =>
    createMockField({
      id,
      base_type,
      effective_type: base_type,
    }),
  );

  const metadata = createMockMetadata({
    fields: [
      createMockField({
        id: STRING_FK_FIELD_ID,
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/FK",
      }),
      createMockField({
        id: INT_FK_FIELD_ID,
        base_type: "type/Integer",
        effective_type: "type/Integer",
        semantic_type: "type/FK",
      }),
      createMockField({
        id: BOOLEAN_FIELD_ID,
        base_type: "type/Boolean",
        effective_type: "type/Boolean",
      }),
      createMockField({
        id: FLOAT_FIELD_ID,
        base_type: "type/Float",
        effective_type: "type/Float",
      }),
      createMockField({
        id: CATEGORY_FIELD_ID,
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Category",
      }),
      createMockField({
        id: LONG_TEXT_FIELD_ID,
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Description",
      }),
      ...dateTimeFields,
    ],
  });

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

    timezones.forEach(offset => {
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
    it('should return "number" for numeric parameters', () => {
      const intParam = createMockParameter({ type: "type/Integer" });
      expect(getInputType(intParam)).toEqual("number");

      const floatParam = createMockParameter({ type: "type/Float" });
      expect(getInputType(floatParam)).toEqual("number");
    });

    it('should return "string" for non-numeric parameters', () => {
      const textParam = createMockParameter({ type: "type/Text" });
      expect(getInputType(textParam)).toEqual("string");

      const turtleParam = createMockParameter({ type: "type/Turtle" });
      expect(getInputType(turtleParam)).toEqual("string");
    });

    it('should return "number" for numeric foreign keys', () => {
      const field = checkNotNull(metadata.field(INT_FK_FIELD_ID));
      expect(getInputType(createMockParameter(), field)).toEqual("number");
    });

    it('should return "string" for string foreign keys', () => {
      const field = checkNotNull(metadata.field(STRING_FK_FIELD_ID));
      expect(getInputType(createMockParameter(), field)).toEqual("string");
    });

    it('should return "number" for floating point numbers', () => {
      const field = checkNotNull(metadata.field(FLOAT_FIELD_ID));
      expect(getInputType(createMockParameter(), field)).toEqual("number");
    });

    it('should return "boolean" for booleans', () => {
      const field = checkNotNull(metadata.field(BOOLEAN_FIELD_ID));
      expect(getInputType(createMockParameter(), field)).toEqual("boolean");
    });

    it('should return "date" for dates', () => {
      const field = checkNotNull(metadata.field(DATE_FIELD_ID));
      expect(getInputType(createMockParameter(), field)).toEqual("date");
    });

    it('should return "datetime" for datetimes', () => {
      const parameter = createMockParameter();

      const dateTimeField = checkNotNull(metadata.field(DATETIME_FIELD_ID));
      const dateTimeLocalTZField = checkNotNull(
        metadata.field(DATETIME_LOCAL_TZ_FIELD_ID),
      );

      expect(getInputType(parameter, dateTimeField)).toEqual("datetime");
      expect(getInputType(parameter, dateTimeLocalTZField)).toEqual("datetime");
    });

    it('should return "time" for times', () => {
      const parameter = createMockParameter();

      const timeField = checkNotNull(metadata.field(TIME_FIELD_ID));
      const timeLocalTZField = checkNotNull(
        metadata.field(TIME_LOCAL_TZ_FIELD_ID),
      );

      expect(getInputType(parameter, timeField)).toEqual("time");
      expect(getInputType(parameter, timeLocalTZField)).toEqual("time");
    });

    it('should return "string" for categories', () => {
      const field = checkNotNull(metadata.field(CATEGORY_FIELD_ID));
      expect(getInputType(createMockParameter(), field)).toEqual("string");
    });

    it('should return "text" for description', () => {
      const field = checkNotNull(metadata.field(LONG_TEXT_FIELD_ID));
      expect(getInputType(createMockParameter(), field)).toEqual("text");
    });
  });

  describe("generateFieldSettingsFromParameters", () => {
    it("should generate settings for a string field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "type/Text" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("string");
    });

    it("should generate settings for an Integer field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "type/Integer" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("should generate settings for a float field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "type/Float" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("generates field settings for an integer field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "type/Integer" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("should generate settings for a dateTime field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "type/DateTime" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("datetime");
    });

    it("should generate settings for a date field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "type/Date" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("date");
    });

    it("generates field settings for a json field", () => {
      const params = [
        createMockParameter({ id: "test-field", type: "type/Structured" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("text");
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
