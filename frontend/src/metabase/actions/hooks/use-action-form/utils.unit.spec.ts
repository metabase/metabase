import Field from "metabase-lib/metadata/Field";
import {
  formatInitialValue,
  getInputType,
  generateFieldSettingsFromParameters,
  stripTZInfo,
} from "./utils";

const createParameter = (options?: any) => {
  return {
    id: "test_parameter",
    name: "Test Parameter",
    "display-name": "Test Parameter",
    type: "type/Text",
    ...options,
  };
};

const createField = (options?: any) => {
  return new Field({
    name: "test_field",
    display_name: "Test Field",
    base_type: "type/Text",
    semantic_type: "type/Text",
    ...options,
  });
};

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
      const intParam = createParameter({ type: "type/Integer" });
      expect(getInputType(intParam)).toEqual("number");

      const floatParam = createParameter({ type: "type/Float" });
      expect(getInputType(floatParam)).toEqual("number");
    });

    it('should return "string" for non-numeric parameters', () => {
      const textParam = createParameter({ type: "type/Text" });
      expect(getInputType(textParam)).toEqual("string");

      const turtleParam = createParameter({ type: "type/Turtle" });
      expect(getInputType(turtleParam)).toEqual("string");
    });

    it('should return "number" for numeric foreign keys', () => {
      const field = createField({
        semantic_type: "type/FK",
        base_type: "type/Integer",
      });
      expect(getInputType(createParameter(), field)).toEqual("number");
    });

    it('should return "string" for string foreign keys', () => {
      const field = createField({
        semantic_type: "type/FK",
        base_type: "type/Text",
      });
      expect(getInputType(createParameter(), field)).toEqual("string");
    });

    it('should return "number" for floating point numbers', () => {
      const field = createField({
        base_type: "type/Float",
      });
      expect(getInputType(createParameter(), field)).toEqual("number");
    });

    it('should return "boolean" for booleans', () => {
      const field = createField({
        base_type: "type/Boolean",
      });
      expect(getInputType(createParameter(), field)).toEqual("boolean");
    });

    it('should return "date" for dates', () => {
      const dateTypes = ["type/Date"];
      const param = createParameter();

      dateTypes.forEach(type => {
        const field = createField({ base_type: type });
        expect(getInputType(param, field)).toEqual("date");
      });
    });

    it('should return "datetime" for datetimes', () => {
      const dateTypes = ["type/DateTime", "type/DateTimeWithLocalTZ"];
      const param = createParameter();

      dateTypes.forEach(type => {
        const field = createField({ base_type: type });
        expect(getInputType(param, field)).toEqual("datetime");
      });
    });

    it('should return "time" for times', () => {
      const dateTypes = ["type/Time", "type/TimeWithLocalTZ"];
      const param = createParameter();

      dateTypes.forEach(type => {
        const field = createField({ base_type: type });
        expect(getInputType(param, field)).toEqual("time");
      });
    });

    it('should return "string" for categories', () => {
      const field = createField({
        semantic_type: "type/Category",
      });
      expect(getInputType(createParameter(), field)).toEqual("string");
    });

    it('should return "text" for description', () => {
      const field = createField({
        semantic_type: "type/Description",
      });
      expect(getInputType(createParameter(), field)).toEqual("text");
    });
  });

  describe("generateFieldSettingsFromParameters", () => {
    it("should generate settings for a string field", () => {
      const params = [createParameter({ id: "test-field", type: "type/Text" })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("string");
    });

    it("should generate settings for an Integer field", () => {
      const params = [
        createParameter({ id: "test-field", type: "type/Integer" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("should generate settings for a float field", () => {
      const params = [
        createParameter({ id: "test-field", type: "type/Float" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("generates field settings for an integer field", () => {
      const params = [
        createParameter({ id: "test-field", type: "type/Integer" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("should generate settings for a dateTime field", () => {
      const params = [
        createParameter({ id: "test-field", type: "type/DateTime" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("datetime");
    });

    it("should generate settings for a date field", () => {
      const params = [createParameter({ id: "test-field", type: "type/Date" })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("date");
    });

    it("generates field settings for a json field", () => {
      const params = [
        createParameter({ id: "test-field", type: "type/Structured" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("text");
    });

    it("should set the parameter id as the object key", () => {
      const params = [createParameter({ id: "test-field" })];
      const [id, _settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(id).toEqual("test-field");
    });

    it("should get title and placeholder from the parameter", () => {
      const params = [
        createParameter({ id: "test-field", "display-name": "Test Field" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.placeholder).toBe("Test Field");
      expect(settings.title).toBe("Test Field");
    });

    it("sets required prop to true", () => {
      const params = [createParameter({ id: "test-field", required: true })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.required).toBe(true);
    });

    it("sets required prop to false", () => {
      const params = [createParameter({ id: "test-field", required: false })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params),
      );

      expect(settings.required).toBe(false);
    });
  });
});
