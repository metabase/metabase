import type { CardError } from "metabase-types/api";

import { formatErrorString } from "./utils";

describe("formatting card errors to string", () => {
  it("unknown fields", () => {
    const fooError: CardError = {
      field: "foo",
      table: "Orders",
      type: "unknown-field",
    };

    const barError: CardError = {
      field: "bar",
      table: "Orders",
      type: "unknown-field",
    };

    expect(formatErrorString([fooError])).toBe("Field foo is unknown");

    expect(formatErrorString([barError, fooError])).toBe(
      "Field bar, foo is unknown",
    );
  });

  it("inactive fields", () => {
    const createdError: CardError = {
      field: "created_at",
      table: "Orders",
      type: "inactive-field",
    };

    const lastUsedError: CardError = {
      field: "last_used",
      table: "Orders",
      type: "inactive-field",
    };

    expect(formatErrorString([createdError])).toBe(
      "Field created_at is inactive",
    );

    expect(formatErrorString([createdError, lastUsedError])).toBe(
      "Field created_at, last_used is inactive",
    );
  });

  it("unknown tables", () => {
    const ordersError: CardError = {
      table: "Orders",
      type: "unknown-table",
    };

    const productsError: CardError = {
      table: "Products",
      type: "unknown-table",
    };

    expect(formatErrorString([ordersError])).toBe("Table Orders is unknown");

    expect(formatErrorString([ordersError, productsError])).toBe(
      "Table Orders, Products is unknown",
    );
  });

  it("inactive tables", () => {
    const ordersError: CardError = {
      table: "Orders",
      type: "inactive-table",
    };

    const productsError: CardError = {
      table: "Products",
      type: "inactive-table",
    };

    expect(formatErrorString([ordersError])).toBe("Table Orders is inactive");

    expect(formatErrorString([ordersError, productsError])).toBe(
      "Table Orders, Products is inactive",
    );
  });

  it("should not error if a new error is introduced", () => {
    const surpriseError: CardError = {
      table: "Orders",
      type: "surprise-error" as CardError["type"],
    };

    const productsError: CardError = {
      table: "Products",
      type: "inactive-table",
    };

    expect(formatErrorString([surpriseError])).toBe("Unknown data reference");

    expect(formatErrorString([surpriseError, productsError])).toBe(
      "Table Products is inactive",
    );
  });
});
