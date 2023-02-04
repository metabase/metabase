import {
  metadata,
  SAMPLE_DATABASE,
  ORDERS,
  PRODUCTS,
} from "__support__/sample_database_fixture";

import { Card } from "metabase-types/types/Card";
import Question from "metabase-lib/Question";

import { getObjectName, getDisplayId, getIdValue } from "./utils";

const card = {
  id: 1,
  name: "Special Orders",
  display: "table",
  visualization_settings: {},
  can_write: true,
  dataset_query: {
    type: "query",
    database: SAMPLE_DATABASE?.id,
    query: {
      "source-table": ORDERS.id,
    },
  },
} as Card;

describe("ObjectDetail utils", () => {
  const productIdCol = {
    name: "product_id",
    display_name: "Product ID",
    base_type: "int",
    effective_type: "int",
    semantic_type: "type/PK",
    table_id: PRODUCTS.id,
  };
  const idCol = {
    name: "id",
    display_name: "ID",
    base_type: "int",
    effective_type: "int",
    semantic_type: "type/PK",
    table_id: ORDERS.id,
  };
  const qtyCol = {
    name: "qty",
    display_name: "qty",
    base_type: "int",
    effective_type: "int",
    semantic_type: "type/int",
    table_id: ORDERS.id,
  };
  const nameCol = {
    name: "id",
    display_name: "ID",
    base_type: "string",
    effective_type: "string",
    semantic_type: "type/Name",
    table_id: ORDERS.id,
  };

  describe("getObjectName", () => {
    const question = new Question(card, metadata);
    const table = question.table();

    it("should get an entity name when there is an entity name column", () => {
      const name = getObjectName({
        table: null,
        question: question,
        cols: [idCol, qtyCol, nameCol],
        zoomedRow: [22, 33, "Giant Sprocket"],
      });

      expect(name).toBe("Giant Sprocket");
    });

    it("should get a singularized table name if no entity name is present", () => {
      const name = getObjectName({
        table: table as any,
        question: question,
        cols: [idCol, qtyCol],
        zoomedRow: [22, 33],
      });

      expect(name).toBe("Order");
    });

    it("should get a singularized question name if neither table nor entity names are present", () => {
      const name = getObjectName({
        table: null,
        question: question,
        cols: [idCol, qtyCol],
        zoomedRow: [22, 33],
      });

      expect(name).toBe("Special Order");
    });

    it("should fall back to default text", () => {
      const name = getObjectName({
        table: null,
        question: new Question(
          {
            ...card,
            name: "",
          },
          metadata,
        ),
        cols: [idCol, qtyCol],
        zoomedRow: [22, 33],
      });

      expect(name).toBe("Item Detail");
    });
  });

  describe("getDisplayId", () => {
    it("should get a display id when there is a single primary key column in the table", () => {
      const id = getDisplayId({
        cols: [productIdCol, idCol, qtyCol, nameCol],
        zoomedRow: [11, 22, 33, "Giant Sprocket"],
        tableId: ORDERS.id,
      });

      expect(id).toBe(22);
    });

    it("should return null if there is no primary key and an entity name", () => {
      const id = getDisplayId({
        cols: [qtyCol, nameCol],
        zoomedRow: [33, "Giant Sprocket"],
      });

      expect(id).toBe(null);
    });

    it("should return the first row's value if there is neither an entity name nor a primary key", () => {
      const id = getDisplayId({
        cols: [qtyCol, qtyCol],
        zoomedRow: [33, 44],
      });

      expect(id).toBe(33);
    });
  });

  describe("getIdValue", () => {
    // this code should no longer be reachable now that we always reach object detail by zooming
    it("should return the primary key of the first row if now zoomed row id exists", () => {
      const id = getIdValue({
        data: {
          cols: [productIdCol, idCol, qtyCol, nameCol],
          rows: [
            [11, 22, 33, "Giant Sprocket"],
            [33, 44, 55, "Tiny Sprocket"],
          ],
        },
        tableId: ORDERS.id,
      });

      expect(id).toBe(22);
    });
  });
});
