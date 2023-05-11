// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Metadata from "./Metadata";
import Base from "./Base";
import Database from "./Database";
import Table from "./Table";
import Segment from "./Segment";
import Metric from "./Metric";
import { createMockConcreteField } from "./mocks";

describe("Metadata", () => {
  describe("instantiation", () => {
    it("should create an instance of Metadata", () => {
      expect(new Metadata()).toBeInstanceOf(Metadata);
    });
    it("should add `object` props to the instance (because it extends Base)", () => {
      expect(new Metadata()).toBeInstanceOf(Base);
      expect(
        new Metadata({
          foo: "bar",
        }),
      ).toHaveProperty("foo", "bar");
    });
  });
  describe("databasesList (deprecated)", () => {
    let databases;
    let databaseA;
    let databaseB;
    let databaseC;
    beforeEach(() => {
      databaseA = new Database({
        id: 2,
        name: "A",
        is_saved_questions: true,
      });
      databaseB = new Database({
        id: 3,
        name: "B",
      });
      databaseC = new Database({
        id: 1,
        name: "C",
      });
      databases = {
        1: databaseC,
        2: databaseA,
        3: databaseB,
      };
    });
    it("should return a sorted list of database objects found on the metadata instance", () => {
      const metadata = new Metadata({
        databases,
      });
      expect(metadata.databasesList()).toEqual([
        databaseA,
        databaseB,
        databaseC,
      ]);
    });
    it("should return all databases when the `savedQuestions` flag is true", () => {
      const metadata = new Metadata({
        databases,
      });
      expect(
        metadata.databasesList({
          savedQuestions: true,
        }),
      ).toEqual(metadata.databasesList());
    });
    it("should exclude the 'is_saved_questions' db when the `savedQuestions` flag is false", () => {
      const metadata = new Metadata({
        databases,
      });
      expect(
        metadata.databasesList({
          savedQuestions: false,
        }),
      ).toEqual([databaseB, databaseC]);
    });
  });
  describe("tablesList (deprecated)", () => {
    it("should return a list of table objects found on the instance", () => {
      const tableA = new Table({
        id: 1,
        name: "A",
      });
      const tableB = new Table({
        id: 2,
        name: "B",
      });
      const tables = {
        1: tableA,
        2: tableB,
      };
      const metadata = new Metadata({
        tables,
      });
      expect(metadata.tablesList()).toEqual([tableA, tableB]);
    });
  });
  describe("metricsList (deprecated)", () => {
    it("should return a list of metric objects found on the instance", () => {
      const metricA = new Metric({
        id: 1,
        name: "A",
      });
      const metricB = new Metric({
        id: 2,
        name: "B",
      });
      const metrics = {
        1: metricA,
        2: metricB,
      };
      const metadata = new Metadata({
        metrics,
      });
      expect(metadata.metricsList()).toEqual([metricA, metricB]);
    });
  });
  describe("segmentsList (deprecated)", () => {
    it("should return a list of segment objects found on the instance", () => {
      const segmentA = new Segment({
        id: 1,
        name: "A",
      });
      const segmentB = new Segment({
        id: 2,
        name: "B",
      });
      const segments = {
        1: segmentA,
        2: segmentB,
      };
      const metadata = new Metadata({
        segments,
      });
      expect(metadata.segmentsList()).toEqual([segmentA, segmentB]);
    });
  });

  [
    ["segment", obj => new Segment(obj)],
    ["metric", obj => new Metric(obj)],
    ["database", obj => new Database(obj)],
    ["table", obj => new Table(obj)],
  ].forEach(([fnName, instantiate]) => {
    describe(fnName, () => {
      let instanceA;
      let instanceB;
      let metadata;
      beforeEach(() => {
        instanceA = instantiate({
          id: 1,
          name: "A",
        });
        instanceB = instantiate({
          id: 2,
          name: "B",
        });
        const instances = {
          1: instanceA,
          2: instanceB,
        };
        metadata = new Metadata({
          [`${fnName}s`]: instances,
        });
      });
      it(`should retun the ${fnName} with the given id`, () => {
        expect(metadata[fnName](1)).toBe(instanceA);
        expect(metadata[fnName](2)).toBe(instanceB);
      });
      it("should return null when the id matches nothing", () => {
        expect(metadata[fnName](3)).toBeNull();
      });
      it("should return null when the id is nil", () => {
        expect(metadata[fnName]()).toBeNull();
      });
    });
  });

  describe("`field`", () => {
    it("should return null when given a nil fieldId arg", () => {
      const metadata = new Metadata({
        fields: {},
      });
      expect(metadata.field()).toBeNull();
      expect(metadata.field(null)).toBeNull();
    });

    describe("when given a fieldId and no tableId", () => {
      it("should return null when there is no matching field", () => {
        const metadata = new Metadata({
          fields: {},
        });
        expect(metadata.field(1)).toBeNull();
      });

      it("should return the matching Field instance", () => {
        const field = createMockConcreteField({ apiOpts: { id: 1 } });
        const uniqueId = field.getUniqueId();
        const metadata = new Metadata({
          fields: {
            [uniqueId]: field,
          },
        });

        expect(metadata.field(1)).toBe(field);
      });
    });

    describe("when given a fieldId and a concrete tableId", () => {
      it("should ignore the tableId arg because these fields are stored using the field's id", () => {
        const field = createMockConcreteField({
          apiOpts: { id: 1, table_id: 1 },
        });
        const uniqueId = field.getUniqueId();
        const metadata = new Metadata({
          fields: {
            [uniqueId]: field,
          },
        });

        expect(metadata.field(1, 1)).toBe(field);
        // to prove the point that the `tableId` is ignore in this scenario
        expect(metadata.field(1, 2)).toBe(field);
        expect(metadata.field(1)).toBe(field);
      });
    });

    describe("when given a fieldId and a virtual card tableId", () => {
      it("should return the matching Field instance, stored using the field's `uniqueId`", () => {
        const field = createMockConcreteField({
          apiOpts: { id: 1, table_id: "card__123" },
        });
        const uniqueId = field.getUniqueId();
        const metadata = new Metadata({
          fields: {
            [uniqueId]: field,
          },
        });

        expect(metadata.field(1, "card__123")).toBe(field);
        expect(metadata.field("card__123:1")).toBe(field);

        expect(metadata.field(1)).not.toBe(field);
      });
    });
  });
});
