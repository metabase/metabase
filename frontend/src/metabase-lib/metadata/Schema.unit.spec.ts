import Schema from "./Schema";

describe("Schema", () => {
  describe("instantiation", () => {
    it("should create an instance of Schema", () => {
      expect(new Schema({ id: "1:public", name: "public" })).toBeInstanceOf(
        Schema,
      );
    });
    it("should add `object` props to the instance", () => {
      expect(
        new Schema({
          id: "1:public",
          name: "public",
        }),
      ).toHaveProperty("name", "public");
    });
  });
  describe("displayName", () => {
    it("should return a formatted `name` string", () => {
      const schema = new Schema({
        id: "name: public",
        name: "foo_bar",
      });
      expect(schema.displayName()).toBe("Foo Bar");
    });
  });
});
