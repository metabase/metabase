import { setParameterValue } from "./actions";

describe("setParameterValue", () => {
  it.each(["", []])(
    "should store a cleared value %p as null (metabase#31606)",
    (value) => {
      expect(setParameterValue("param-id", value).payload).toEqual({
        id: "param-id",
        value: null,
      });
    },
  );

  it.each([0, "0", false, ["a"], "a"])(
    "should store a set value %p as is",
    (value) => {
      expect(setParameterValue("param-id", value).payload).toEqual({
        id: "param-id",
        value,
      });
    },
  );
});
