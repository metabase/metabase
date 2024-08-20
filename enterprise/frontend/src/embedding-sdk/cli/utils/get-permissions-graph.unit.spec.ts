import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { getPermissionGraph } from "./get-permission-graph";

const getMockTable = (id: number) =>
  createMockTable({
    id,
    schema: "public",
    fields: [createMockField({ id, name: "customer_id" })],
  });

describe("getPermissionsGraph for embedding CLI", () => {
  it("should return a valid permissions graph", () => {
    const groupIds = [1, 2, 3];
    const chosenTables = [getMockTable(3), getMockTable(4)];

    const graph = getPermissionGraph({
      tables: [getMockTable(1), getMockTable(2), ...chosenTables],
      chosenTables,
      groupIds,
      tenancyColumnNames: { 3: "customer_id", 4: "customer_id" },
    });

    for (const groupId of groupIds) {
      expect(graph.groups[groupId]).toStrictEqual(EXPECTED_PERMISSION_GROUP);
    }

    // Expect 6 sandboxes: 3 customer groups x 2 tables with tenant isolation
    expect(graph.sandboxes.length).toBe(6);
    expect(graph.sandboxes[0]).toStrictEqual(EXPECTED_PERMISSION_SANDBOX);
  });
});

const EXPECTED_PERMISSION_GROUP = {
  "1": {
    "create-queries": "no",
    download: {
      schemas: "none",
    },
    "view-data": "blocked",
  },
  "2": {
    "create-queries": {
      public: {
        "3": "query-builder",
        "4": "query-builder",
      },
    },
    download: {
      schemas: {
        public: {
          "1": "none",
          "2": "none",
          "3": "full",
          "4": "full",
        },
      },
    },
    "view-data": {
      public: {
        "1": "unrestricted",
        "2": "unrestricted",
        "3": "sandboxed",
        "4": "sandboxed",
      },
    },
  },
};

const EXPECTED_PERMISSION_SANDBOX = {
  card_id: null,
  group_id: 1,
  table_id: 3,
  attribute_remappings: {
    customer_id: [
      "dimension",
      [
        "field",
        3,
        {
          "base-type": "type/Text",
        },
      ],
    ],
  },
};
