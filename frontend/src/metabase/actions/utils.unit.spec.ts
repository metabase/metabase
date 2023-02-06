import Field from "metabase-lib/metadata/Field";

import {
  getDefaultFieldSettings,
  getDefaultFormSettings,
  sortActionParams,
  generateFieldSettingsFromParameters,
  getInputType,
} from "./utils";

const createParameter = (options?: any) => {
  return {
    id: "test_parameter",
    name: "Test Parameter",
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

describe("sortActionParams", () => {
  const formSettings = getDefaultFormSettings({
    fields: {
      a: getDefaultFieldSettings({ order: 0 }),
      b: getDefaultFieldSettings({ order: 1 }),
      c: getDefaultFieldSettings({ order: 2 }),
    },
  });

  it("should return a sorting function", () => {
    const sortFn = sortActionParams(formSettings);
    expect(typeof sortFn).toBe("function");
  });

  it("should sort params by the settings-defined field order", () => {
    const sortFn = sortActionParams(formSettings);

    const params = [
      createParameter({ id: "c" }),
      createParameter({ id: "a" }),
      createParameter({ id: "b" }),
    ];

    const sortedParams = params.sort(sortFn);

    expect(sortedParams[0].id).toEqual("a");
    expect(sortedParams[1].id).toEqual("b");
    expect(sortedParams[2].id).toEqual("c");
  });

  describe("generateFieldSettingsFromParameters", () => {
    it("should generate settings for a string field", () => {
      const fields = [createField({ name: "test-field" })];
      const params = [createParameter({ id: "test-field" })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("string");
    });

    it("should generate settings for an Integer field", () => {
      const fields = [
        createField({
          name: "test-field",
          base_type: "type/Integer",
          semantic_type: "type/Integer",
        }),
      ];
      const params = [
        createParameter({ id: "test-field", type: "type/Integer" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("should generate settings for a float field", () => {
      const fields = [
        createField({
          name: "test-field",
          base_type: "type/Float",
          semantic_type: "type/Float",
        }),
      ];
      const params = [
        createParameter({ id: "test-field", type: "type/Float" }),
      ];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(settings.fieldType).toBe("number");
      expect(settings.inputType).toBe("number");
    });

    it("should generate settings for a category field", () => {
      const fields = [
        createField({ name: "test-field", semantic_type: "type/Category" }),
      ];
      const params = [createParameter({ id: "test-field", type: "type/Text" })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(settings.fieldType).toBe("string");
      expect(settings.inputType).toBe("category");
    });

    it("should set the parameter id as the object key", () => {
      const fields = [createField({ name: "test-field" })];
      const params = [createParameter({ id: "test-field" })];
      const [id, _settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(id).toEqual("test-field");
    });

    it("should get display name from field metadata", () => {
      const fields = [createField({ name: "test-field" })];
      const params = [createParameter({ id: "test-field" })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(settings.placeholder).toBe("Test Field");
      expect(settings.title).toBe("Test Field");
    });

    it("matches field names to parameter ids case-insensitively", () => {
      const fields = [createField({ name: "TEST-field" })];
      const params = [createParameter({ id: "test-field" })];
      const [id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(id).toEqual("test-field");
      expect(settings.placeholder).toBe("Test Field");
      expect(settings.title).toBe("Test Field");
      expect(settings.name).toBe("Test Parameter");
    });

    it("sets settings from parameter if there is no corresponding field", () => {
      const fields = [createField({ name: "xyz", description: "foo bar baz" })];
      const params = [createParameter({ id: "test-field", name: null })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(settings.placeholder).toBe("test-field");
      expect(settings.title).toBe("test-field");
      expect(settings.name).toBe("test-field");
    });

    it("sets required prop to true", () => {
      const fields = [createField({ name: "test-field" })];
      const params = [createParameter({ id: "test-field", required: true })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(settings.required).toBe(true);
    });

    it("sets required prop to false", () => {
      const fields = [createField({ name: "test-field" })];
      const params = [createParameter({ id: "test-field", required: false })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(settings.required).toBe(false);
    });

    it("sets description text", () => {
      const fields = [
        createField({ name: "test-field", description: "foo bar baz" }),
      ];
      const params = [createParameter({ id: "test-field" })];
      const [_id, settings] = getFirstEntry(
        generateFieldSettingsFromParameters(params, fields),
      );

      expect(settings.description).toBe("foo bar baz");
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

    it('should return "category" for categories', () => {
      const field = createField({
        semantic_type: "type/Category",
      });
      expect(getInputType(createParameter(), field)).toEqual("category");
    });

    it('should return "text" for description', () => {
      const field = createField({
        semantic_type: "type/Description",
      });
      expect(getInputType(createParameter(), field)).toEqual("text");
    });
  });
});
