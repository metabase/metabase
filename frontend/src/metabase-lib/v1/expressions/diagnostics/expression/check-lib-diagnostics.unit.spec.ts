import { createMockMetadata } from "__support__/metadata";
import ValidationError from "metabase-lib/v1/ValidationError";
import type { NativeQuery } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTemplateTag,
} from "metabase-types/api/mocks";

import { checkNativeQueryDiagnostics } from "./check-lib-diagnostics";

interface SetupOpts {
  native?: Partial<NativeQuery>;
}

const setup = ({ native = {} }: SetupOpts = {}) => {
  const mockDb = createMockDatabase();
  const metadata = createMockMetadata({
    databases: [mockDb],
  });
  const db = metadata.database(mockDb.id);

  if (!db) {
    throw new TypeError();
  }

  const question = db.nativeQuestion(native);
  const query = question.legacyNativeQuery();

  if (!query) {
    throw new TypeError("query is not defined");
  }

  return query;
};

describe("checkNativeQueryDiagnostics", () => {
  it("allows only mb.time_grouping and no conflicts", () => {
    const query = setup({
      native: {
        query: `SELECT {{mb.time_grouping("unit", "created_at")}} as unit FROM ORDERS`,
        "template-tags": {
          unit: createMockTemplateTag({ type: "temporal-unit", name: "unit" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(query)).not.toThrow();
  });

  it("throws on unsupported mb. function", () => {
    const query = setup({
      native: {
        query: `SELECT {{mb.foobar("foo")}} as foo FROM ORDERS`,
      },
    });

    expect(() => checkNativeQueryDiagnostics(query)).toThrow(ValidationError);
    expect(() => checkNativeQueryDiagnostics(query)).toThrow(
      "Unsupported mb. function(s) used: foobar. Only mb.time_grouping is allowed.",
    );
  });

  it("throws if parameter is used as both mb.time_grouping and filter variable", () => {
    const query = setup({
      native: {
        query: `SELECT {{mb.time_grouping("unit", "created_at")}} as unit, {{unit}} as filter FROM ORDERS`,
        "template-tags": {
          unit: createMockTemplateTag({ type: "temporal-unit", name: "unit" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(query)).toThrow(
      /both a time grouping and a variable/,
    );
  });

  it("throws if parameter is used as mb.time_grouping and as a different type in template tags", () => {
    const nq = setup({
      native: {
        query: `SELECT {{mb.time_grouping("foo", "created_at")}} as unit FROM ORDERS`,
        "template-tags": {
          foo: createMockTemplateTag({ type: "text", name: "foo" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(nq)).toThrow(
      /as a time grouping and as a parameter of type "text"/,
    );
  });

  it("allows multiple mb.time_grouping with same param, different columns", () => {
    const query = setup({
      native: {
        query: `SELECT {{mb.time_grouping("unit", "created_at")}} as unit1, {{mb.time_grouping("unit", "updated_at")}} as unit2 FROM ORDERS`,
        "template-tags": {
          unit: createMockTemplateTag({ type: "temporal-unit", name: "unit" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(query)).not.toThrow();
  });

  it("allows unrelated template tags", () => {
    const query = setup({
      native: {
        query: `SELECT {{mb.time_grouping("unit", "created_at")}} as unit, {{other}} as something FROM ORDERS`,
        "template-tags": {
          unit: createMockTemplateTag({ type: "temporal-unit", name: "unit" }),
          other: createMockTemplateTag({ type: "text", name: "other" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(query)).not.toThrow();
  });

  it("throws if first argument is not a string in quotes", () => {
    const query = setup({
      native: {
        query: `SELECT {{mb.time_grouping(unit, "created_at")}} as unit FROM ORDERS`,
        "template-tags": {
          unit: createMockTemplateTag({ type: "temporal-unit", name: "unit" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(query)).toThrow(
      /Argument 1 of mb.time_grouping must be a string in quotes/,
    );
  });

  it("throws if second argument is not a string in quotes", () => {
    const query = setup({
      native: {
        query: `SELECT {{mb.time_grouping("unit", created_at)}} as unit FROM ORDERS`,
        "template-tags": {
          unit: createMockTemplateTag({ type: "temporal-unit", name: "unit" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(query)).toThrow(
      /Argument 2 of mb.time_grouping must be a string in quotes/,
    );
  });

  it("throws if either argument is missing", () => {
    const query1 = setup({
      native: {
        query: `SELECT {{mb.time_grouping("unit")}} as unit FROM ORDERS`,
        "template-tags": {
          unit: createMockTemplateTag({ type: "temporal-unit", name: "unit" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(query1)).toThrow(
      /mb.time_grouping must have at least two arguments/,
    );
    const query2 = setup({
      native: {
        query: `SELECT {{mb.time_grouping()}} as unit FROM ORDERS`,
      },
    });
    expect(() => checkNativeQueryDiagnostics(query2)).toThrow(
      /mb.time_grouping must have at least two arguments/,
    );
  });

  it("allows both arguments as single-quoted strings", () => {
    const query = setup({
      native: {
        query: `SELECT {{mb.time_grouping('unit', 'created_at')}} as unit FROM ORDERS`,
        "template-tags": {
          unit: createMockTemplateTag({ type: "temporal-unit", name: "unit" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(query)).not.toThrow();
  });

  it("throws if mb.time_grouping function call is incomplete (missing closing parenthesis)", () => {
    const query = setup({
      native: {
        query: `SELECT count(*) as c, {{mb.time_grouping("unit", "created_"}} as unit FROM ORDERS group by unit`,
        "template-tags": {
          unit: createMockTemplateTag({ type: "temporal-unit", name: "unit" }),
        },
      },
    });
    expect(() => checkNativeQueryDiagnostics(query)).toThrow(ValidationError);
    expect(() => checkNativeQueryDiagnostics(query)).toThrow(
      /mb.time_grouping must be used as a function call/,
    );
  });
});
