import Base from "../Base";
import Database from "../Database";
import Table from "../Table";
import Schema from ".";

const DEFAULT_SCHEMA_PROPERTIES = {
  id: "default-schema-id",
  name: "default-schema",
  database: new Database(),
  tables: [new Table()],
};

describe("Schema", () => {
  describe("instantiation", () => {
    it("should create an instance of Schema", () => {
      expect(new Schema(DEFAULT_SCHEMA_PROPERTIES)).toBeInstanceOf(Schema);
    });
    it("should add `object` props to the instance (because it extends Base)", () => {
      expect(new Schema(DEFAULT_SCHEMA_PROPERTIES)).toBeInstanceOf(Base);
      expect(
        new Schema({
          ...DEFAULT_SCHEMA_PROPERTIES,
          foo: "bar",
        }),
      ).toHaveProperty("foo", "bar");
    });
  });

  describe("displayName", () => {
    it("should return a formatted `name` string", () => {
      const schema = new Schema({
        ...DEFAULT_SCHEMA_PROPERTIES,
        name: "foo_bar",
      });
      expect(schema.displayName()).toBe("Foo Bar");
    });
  });
});
