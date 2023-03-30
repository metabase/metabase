import _ from "underscore";

import * as ML from "cljs/metabase.lib.js";
import * as ML_MetadataCalculation from "cljs/metabase.lib.metadata.calculation";

import * as SampleDatabase from "__support__/sample_database_fixture";

const createMetadataProvider = () =>
  ML.metadataProvider(
    SampleDatabase.SAMPLE_DATABASE.id,
    SampleDatabase.metadata,
  );

const createQuery = () => {
  const query = ML.query(
    SampleDatabase.SAMPLE_DATABASE.id,
    createMetadataProvider(),
    {
      database: SampleDatabase.SAMPLE_DATABASE.id,
      type: "query",
      query: {
        "source-table": SampleDatabase.ORDERS.id,
      },
    },
  );

  it("can create an MLv2 query", () => {
    expect(query).toBeTruthy();
    expect(ML.suggestedName(query)).toBe("Orders");
  });

  return query;
};

describe("orderableColumns", () => {
  const query = createQuery();
  const orderableColumns = ML.orderable_columns(query);

  it("returns an array", () => {
    expect(orderableColumns).toBeInstanceOf(Array);
  });

  describe("returns metadata for columns in the source table", () => {
    it("contains ORDERS.ID", () => {
      const ordersID = _.find(
        orderableColumns,
        ({ id }) => id === SampleDatabase.ORDERS.ID.id,
      );

      expect(ordersID).toEqual(
        expect.objectContaining({
          table_id: SampleDatabase.ORDERS.id,
          name: "ID",
          id: SampleDatabase.ORDERS.ID.id,
          display_name: "ID",
          base_type: "type/BigInteger",
        }),
      );
    });
  });

  describe("returns metadata for columns in implicitly joinable tables", () => {
    it("contains PRODUCTS.TITLE", () => {
      const productsTitle = _.find(
        orderableColumns,
        ({ id }) => id === SampleDatabase.PRODUCTS.TITLE.id,
      );

      expect(productsTitle).toEqual(
        expect.objectContaining({
          table_id: SampleDatabase.PRODUCTS.id,
          name: "TITLE",
          id: SampleDatabase.PRODUCTS.TITLE.id,
          display_name: "Title",
          base_type: "type/Text",
        }),
      );
    });
  });
});

describe("add order by", () => {
  const query = createQuery();

  const orderBys = ML.order_bys(query);

  it("should not have order bys yet", () => {
    expect(orderBys).toBeNull();
  });

  const orderableColumns = ML.orderable_columns(query);
  const productsTitle = _.find(
    orderableColumns,
    ({ id }) => id === SampleDatabase.PRODUCTS.TITLE.id,
  );

  it("should include PRODUCTS.TITLE in orderableColumns", () => {
    expect(productsTitle).toBeTruthy();
  });

  it("should update the query", () => {
    const updatedQuery = ML.order_by(query, productsTitle);
    // This name isn't GREAT but it's ok for now, we can update this if we improve MLv2.
    expect(ML.suggestedName(updatedQuery)).toBe(
      "Orders, Sorted by Title ascending",
    );

    const updatedOrderBys = ML.order_bys(updatedQuery);

    expect(updatedOrderBys).toHaveLength(1);
    const orderBy = updatedOrderBys[0];

    expect(ML_MetadataCalculation.display_name(query, orderBy)).toBe(
      "Title ascending",
    );
  });
});
