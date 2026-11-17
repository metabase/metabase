import type { HistoryProfile } from "metabase/metadata/table-structure";
import { createMockField } from "metabase-types/api/mocks";

import {
  type ExampleSource,
  getChangeShapeExample,
  getHistoryShapeExample,
  getMockExampleVersions,
  getProfileExampleVersions,
} from "./history-shape-example";

const SOURCE: ExampleSource = {
  keyName: "Customer ID",
  attributeName: "Plan",
  validFromName: "Valid from",
  validToName: "Valid to",
  versions: getMockExampleVersions(),
  currentTableName: "Customers",
  factTableName: "Orders",
};

const version = (
  validFrom: string,
  validTo: string | null,
  plan: string,
): HistoryProfile["entities"][number]["versions"][number] => ({
  rowIndex: 0,
  version: null,
  validFrom,
  validTo,
  isOpen: validTo == null,
  isCurrent: validTo == null,
  values: { plan },
});

describe("getHistoryShapeExample", () => {
  it("shows every version with its dates, the open one current", () => {
    const example = getHistoryShapeExample("versions-with-dates", SOURCE);

    expect(example.columns).toEqual([
      "Customer ID",
      "Plan",
      "Valid from",
      "Valid to",
    ]);
    expect(example.rows.at(-1)).toEqual([
      "1042",
      "Enterprise",
      "2025-02-14",
      "—",
    ]);
    expect(example.currentRowIndex).toBe(2);
  });

  it("leaves today's row out of a table of old versions", () => {
    const example = getHistoryShapeExample("current-table", SOURCE);

    expect(example.rows).toHaveLength(2);
    expect(example.note).toBe("Today's row is in Customers.");
  });

  it("repeats today's value on every version", () => {
    const example = getHistoryShapeExample("current-values", SOURCE);

    expect(example.rows.map((row) => row[2])).toEqual([
      "Enterprise",
      "Enterprise",
      "Enterprise",
    ]);
  });

  it("shows fact rows keyed by the entity", () => {
    const example = getHistoryShapeExample("fact-key", SOURCE);

    expect(example.columns).toEqual(["Orders", "Customer ID", "Date"]);
  });
});

describe("getChangeShapeExample", () => {
  it("adds the previous value column", () => {
    expect(
      getChangeShapeExample("previous-value", {
        keyName: "ID",
        attributeName: "Category",
        previousAttributeName: "Previous category",
      }).columns,
    ).toEqual(["ID", "Category", "Previous category"]);
  });
});

describe("getProfileExampleVersions", () => {
  const plan = createMockField({ name: "plan", display_name: "Plan" });

  it("uses an entity whose most-changed column changes", () => {
    const result = getProfileExampleVersions({
      columns: [
        {
          field: plan,
          changeCount: 4,
          changedEntityCount: 2,
          lastChangedAt: null,
        },
      ],
      entities: [
        {
          key: "A",
          label: null,
          issues: [],
          versions: [
            version("2024-01-01", "2024-02-01", "Pro"),
            version("2024-02-01", null, "Pro"),
          ],
        },
        {
          key: "B",
          label: null,
          issues: [],
          versions: [
            version("2024-01-01T00:00:00", "2024-03-01", "Starter"),
            version("2024-03-01", null, "Pro"),
          ],
        },
      ],
    });

    expect(result).toEqual({
      attributeName: "Plan",
      versions: [
        {
          key: "B",
          attribute: "Starter",
          validFrom: "2024-01-01",
          validTo: "2024-03-01",
        },
        { key: "B", attribute: "Pro", validFrom: "2024-03-01", validTo: null },
      ],
    });
  });

  it("returns null without a changing column", () => {
    expect(getProfileExampleVersions({ columns: [], entities: [] })).toBeNull();
  });
});
