// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Schema from "./Schema";

describe("Schema", () => {
  describe("instantiation", () => {
    it("should create an instance of Schema", () => {
      expect(new Schema({})).toBeInstanceOf(Schema);
    });
    it("should add `object` props to the instance (because it extends Base)", () => {
      expect(new Schema({ name: "public" })).toBeInstanceOf(Schema);
      expect(
        new Schema({
          name: "public",
        }),
      ).toHaveProperty("name", "public");
    });
  });
  describe("displayName", () => {
    it("should return a formatted `name` string", () => {
      const schema = new Schema({
        name: "foo_bar",
      });
      expect(schema.displayName()).toBe("Foo Bar");
    });
  });
});
