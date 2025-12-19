import type { Card, DatasetQuery } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { parseInitialSqlParameters } from "./parse-initial-sql-parameters";

describe("parseInitialSqlParameters", () => {
  const mockCard = createMockCard({
    name: "Test Card",
    parameters: [
      {
        id: "some-id",
        name: "Status",
        type: "string/=",
        slug: "status",
        isMultiSelect: false,
      },
      {
        id: "another-id",
        name: "Ids",
        type: "string/=",
        slug: "ids",
        isMultiSelect: true,
      },
    ],
  });

  it("returns empty object when initialSqlParameters is undefined", () => {
    expect(
      parseInitialSqlParameters({
        initialSqlParameters: undefined,
        card: mockCard,
      }),
    ).toEqual({});
  });

  it("converts single values to strings", () => {
    const result = parseInitialSqlParameters({
      initialSqlParameters: { status: "active", count: 42 },
      card: mockCard,
    });

    expect(result).toEqual({ status: "active", count: "42" });
  });

  it("preserves arrays for multi-select parameters (metabase#64673)", () => {
    const result = parseInitialSqlParameters({
      initialSqlParameters: { ids: ["1", "2", "3"] },
      card: mockCard,
    });

    expect(result).toEqual({ ids: ["1", "2", "3"] });
  });

  it("converts arrays to strings for non-multi-select parameters", () => {
    const result = parseInitialSqlParameters({
      initialSqlParameters: { status: ["active", "pending"] },
      card: mockCard,
    });

    expect(result).toEqual({ status: "active,pending" });
  });

  it("handles card without parameters array", () => {
    const result = parseInitialSqlParameters({
      initialSqlParameters: { foo: "bar" },
      card: {} as Card<DatasetQuery>,
    });

    expect(result).toEqual({ foo: "bar" });
  });

  it("converts non-array values to strings even for multi-select", () => {
    const result = parseInitialSqlParameters({
      initialSqlParameters: { ids: 123 },
      card: mockCard,
    });

    expect(result).toEqual({ ids: "123" });
  });
});
