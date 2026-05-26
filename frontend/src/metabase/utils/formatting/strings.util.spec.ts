import { capitalize } from "./strings";

describe("formatting", () => {
  describe("strings", () => {
    describe("capitalize", () => {
      it("capitalizes a single word", () => {
        expect(capitalize("hello")).toBe("Hello");
      });

      it("capitalizes only the first char of a string", () => {
        expect(capitalize("hello world")).toBe("Hello world");
      });

      it("converts a string to lowercase by default", () => {
        expect(capitalize("heLLo")).toBe("Hello");
      });

      it("doesn't lowercase the string if option provided", () => {
        expect(capitalize("hellO WoRlD", { lowercase: false })).toBe(
          "HellO WoRlD",
        );
      });

      it("doesn't break on an empty string", () => {
        expect(capitalize("")).toBe("");
        expect(capitalize("", { lowercase: false })).toBe("");
      });
    });
  });
});
