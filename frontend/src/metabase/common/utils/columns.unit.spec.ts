import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";

import { getColumnIcon } from "./columns";

describe("common/utils/columns", () => {
  const query = createQuery();
  const columns = Lib.orderableColumns(query, 0);
  const getColumn = columnFinder(query, columns);

  const pkColumn = getColumn("ORDERS", "ID");
  const fkColumn = getColumn("ORDERS", "PRODUCT_ID");
  const numericColumn = getColumn("ORDERS", "TOTAL");
  const stringColumn = getColumn("PRODUCTS", "TITLE");
  const emailColumn = getColumn("PEOPLE", "EMAIL");
  const categoryColumn = getColumn("PRODUCTS", "CATEGORY");
  const dateColumn = getColumn("ORDERS", "CREATED_AT");
  const cityColumn = getColumn("PEOPLE", "CITY");
  const stateColumn = getColumn("PEOPLE", "STATE");
  const latColumn = getColumn("PEOPLE", "LATITUDE");
  const lonColumn = getColumn("PEOPLE", "LONGITUDE");

  describe("getColumnIcon", () => {
    it("should return correct icon for pk columns", () => {
      expect(getColumnIcon(pkColumn)).toBe("label");
    });

    it("should return correct icon for fk columns", () => {
      expect(getColumnIcon(fkColumn)).toBe("connections");
    });

    it("should return correct icon for numeric columns", () => {
      expect(getColumnIcon(numericColumn)).toBe("int");
    });

    it("should return correct icon for string columns", () => {
      expect(getColumnIcon(stringColumn)).toBe("string");
      expect(getColumnIcon(emailColumn)).toBe("string");
      expect(getColumnIcon(categoryColumn)).toBe("string");
    });

    it("should return correct icon for datetime columns", () => {
      expect(getColumnIcon(dateColumn)).toBe("calendar");
    });

    it("should return correct icon for location columns", () => {
      expect(getColumnIcon(cityColumn)).toBe("location");
      expect(getColumnIcon(stateColumn)).toBe("location");
      expect(getColumnIcon(latColumn)).toBe("location");
      expect(getColumnIcon(lonColumn)).toBe("location");
    });
  });
});
