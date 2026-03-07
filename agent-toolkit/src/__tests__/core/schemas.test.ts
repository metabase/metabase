import { describe, it, expect } from "vitest";
import {
  CreateQuestionInputSchema,
  CreateDashboardInputSchema,
  CreateSegmentInputSchema,
  CreateTransformInputSchema,
  ExecuteQueryInputSchema,
  getSchemaForCommand,
  listSchemaCommands,
} from "../../core/schemas.js";

describe("CreateTransformInputSchema", () => {
  it("validates minimal input", () => {
    const result = CreateTransformInputSchema.parse({
      name: "Clean Orders",
      database_id: 1,
      sql: "SELECT * FROM orders",
      target_table: "clean_orders",
    });
    expect(result.name).toBe("Clean Orders");
    expect(result.run).toBeUndefined();
  });

  it("rejects missing required fields", () => {
    expect(() =>
      CreateTransformInputSchema.parse({ name: "Test" }),
    ).toThrow();
  });
});

describe("CreateQuestionInputSchema", () => {
  it("validates with defaults", () => {
    const result = CreateQuestionInputSchema.parse({
      name: "Revenue",
      database_id: 1,
      sql: "SELECT 1",
    });
    expect(result.display).toBe("table");
    expect(result.type).toBe("question");
  });

  it("accepts visualization options", () => {
    const result = CreateQuestionInputSchema.parse({
      name: "Revenue",
      database_id: 1,
      sql: "SELECT 1",
      display: "line",
      visualization: {
        x_axis: ["month"],
        y_axis: ["revenue"],
        show_values: true,
      },
    });
    expect(result.visualization?.x_axis).toEqual(["month"]);
  });

  it("rejects invalid display type", () => {
    expect(() =>
      CreateQuestionInputSchema.parse({
        name: "Test",
        database_id: 1,
        sql: "SELECT 1",
        display: "invalid_type",
      }),
    ).toThrow();
  });
});

describe("CreateSegmentInputSchema", () => {
  it("validates filter input", () => {
    const result = CreateSegmentInputSchema.parse({
      name: "Active Users",
      table_id: 5,
      filters: [
        { field: "last_login", op: "greater-than", value: "2024-01-01" },
      ],
    });
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0].field).toBe("last_login");
  });

  it("rejects empty filters", () => {
    expect(() =>
      CreateSegmentInputSchema.parse({
        name: "Test",
        table_id: 5,
        filters: [],
      }),
    ).toThrow();
  });
});

describe("CreateDashboardInputSchema", () => {
  it("validates minimal dashboard", () => {
    const result = CreateDashboardInputSchema.parse({
      name: "Sales Dashboard",
    });
    expect(result.name).toBe("Sales Dashboard");
    expect(result.cards).toBeUndefined();
  });

  it("validates with cards and filters", () => {
    const result = CreateDashboardInputSchema.parse({
      name: "Sales",
      cards: [{ card_id: 42, width: 6, height: 4 }],
      filters: [
        {
          name: "Date Range",
          type: "date/range",
          targets: [{ card_id: 42, field: "created_at" }],
        },
      ],
    });
    expect(result.cards).toHaveLength(1);
    expect(result.filters).toHaveLength(1);
  });

  it("applies defaults for card dimensions", () => {
    const result = CreateDashboardInputSchema.parse({
      name: "Test",
      cards: [{ card_id: 1 }],
    });
    expect(result.cards![0].width).toBe(6);
    expect(result.cards![0].height).toBe(4);
  });
});

describe("ExecuteQueryInputSchema", () => {
  it("validates query input", () => {
    const result = ExecuteQueryInputSchema.parse({
      database_id: 1,
      sql: "SELECT COUNT(*) FROM orders",
    });
    expect(result.database_id).toBe(1);
  });
});

describe("schema introspection", () => {
  it("lists available schemas", () => {
    const schemas = listSchemaCommands();
    expect(schemas).toContain("create-dashboard");
    expect(schemas).toContain("create-question");
    expect(schemas).toContain("execute-query");
  });

  it("returns JSON Schema for known command", () => {
    const schema = getSchemaForCommand("create-dashboard");
    expect(schema).toBeDefined();
    expect(schema).toHaveProperty("definitions");
  });

  it("returns undefined for unknown command", () => {
    expect(getSchemaForCommand("nonexistent")).toBeUndefined();
  });
});
