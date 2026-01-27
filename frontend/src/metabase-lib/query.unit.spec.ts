import * as Lib from "metabase-lib";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import {
  DEFAULT_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
  createQuery,
} from "./test-helpers";

describe("fromJsQuery", () => {
  // this is a very important optimization that the FE heavily relies upon
  it("should return the same object for the same database id, query, and metadata", () => {
    const metadataProvider = Lib.metadataProvider(
      SAMPLE_DATABASE.id,
      SAMPLE_METADATA,
    );
    const query1 = Lib.fromJsQuery(metadataProvider, DEFAULT_QUERY);
    const query2 = Lib.fromJsQuery(metadataProvider, DEFAULT_QUERY);
    expect(query1 === query2).toBe(true);
  });
});

describe("toLegacyQuery", () => {
  it("should serialize a query", () => {
    const query = createQuery();
    expect(Lib.toLegacyQuery(query)).toEqual(DEFAULT_QUERY);
  });
});

describe("suggestedName", () => {
  it("should suggest a query name", () => {
    const query = createQuery();
    expect(Lib.suggestedName(query)).toBe("Orders");
  });
});

describe("stageIndexes", () => {
  it("should return stage indexes for a single-stage query", () => {
    const query = createQuery();
    expect(Lib.stageIndexes(query)).toEqual([0]);
  });

  it("should return stage indexes for a multi-stage query", () => {
    const query = Lib.appendStage(Lib.appendStage(createQuery()));
    expect(Lib.stageIndexes(query)).toEqual([0, 1, 2]);
  });
});

describe("createTestQuery", () => {
  describe("source", () => {
    it("should create a query with a table source", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
          },
        ],
      });
      expect(Lib.sourceTableOrCardId(query)).toBe(PRODUCTS_ID);
    });
  });

  describe("breakouts", () => {
    it("should create a query with breakouts", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            breakouts: [{ name: "CATEGORY" }],
          },
        ],
      });

      const breakouts = Lib.breakouts(query, 0);
      expect(breakouts).toHaveLength(1);
      expect(Lib.displayInfo(query, 0, breakouts[0])).toMatchObject({
        displayName: "Category",
      });
    });

    it("should create a query with temporal breakouts", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            breakouts: [{ name: "CREATED_AT", unit: "month" }],
          },
        ],
      });

      const breakouts = Lib.breakouts(query, 0);
      expect(breakouts).toHaveLength(1);
      expect(Lib.displayInfo(query, 0, breakouts[0])).toMatchObject({
        displayName: "Created At: Month",
      });
    });
  });

  describe("order bys", () => {
    it("should create a query with order bys", () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: {
              type: "table",
              id: PRODUCTS_ID,
            },
            orderBys: [{ name: "CATEGORY" }],
          },
        ],
      });

      const orderBys = Lib.orderBys(query, 0);
      expect(orderBys).toHaveLength(1);
      expect(Lib.displayInfo(query, 0, orderBys[0])).toMatchObject({
        displayName: "Category",
      });
    });
  });
});
