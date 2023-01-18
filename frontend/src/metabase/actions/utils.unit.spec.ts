import {
  getDefaultFieldSettings,
  getDefaultFormSettings,
  sortActionParams,
} from "./utils";

const createParameter = (options?: any) => {
  return {
    id: "test_parameter",
    name: "Test Parameter",
    type: "type/Text",
    ...options,
  };
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
});
