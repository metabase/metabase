import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { getPermissionsForGroups } from "./get-permission-groups";
import { getSandboxedCollectionPermissions } from "./get-sandboxed-collection-permissions";
import { getTenancyIsolationSandboxes } from "./get-tenancy-isolation-sandboxes";

const getMockTable = (id: number) =>
  createMockTable({
    id,
    schema: "public",
    fields: [createMockField({ id, name: "customer_id" })],
  });

describe("permission graph generation for embedding cli", () => {
  it("should generate a valid permission graph", () => {
    const groupIds = [1, 2, 3];
    const chosenTables = [getMockTable(3), getMockTable(4)];

    const options = {
      tables: [getMockTable(1), getMockTable(2), ...chosenTables],
      chosenTables,
      groupIds,
      tenancyColumnNames: { 3: "customer_id", 4: "customer_id" },
    };

    const groups = getPermissionsForGroups(options);
    const sandboxes = getTenancyIsolationSandboxes(options);

    for (const groupId of groupIds) {
      expect(groups[groupId]).toStrictEqual(EXPECTED_PERMISSION_GROUP);
    }

    // Expect 6 sandboxes: 3 customer groups x 2 tables with tenant isolation
    expect(sandboxes.length).toBe(6);
    expect(sandboxes[0]).toStrictEqual(EXPECTED_PERMISSION_SANDBOX);
  });

  it("should generate valid permissions for collections", () => {
    const groups = getSandboxedCollectionPermissions({
      groupIds: [3, 4, 5],
      collectionIds: [9, 10, 11],
    });

    expect(groups).toStrictEqual(EXPECTED_COLLECTION_PERMISSION_GROUP);
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
        "1": "no",
        "2": "no",
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
        "1": "blocked",
        "2": "blocked",
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

const EXPECTED_COLLECTION_PERMISSION_GROUP = {
  "1": {
    "9": "none",
    "10": "none",
    "11": "none",
  },
  "3": {
    "9": "write",
    "10": "none",
    "11": "none",
    root: "none",
  },
  "4": {
    "9": "none",
    "10": "write",
    "11": "none",
    root: "none",
  },
  "5": {
    "9": "none",
    "10": "none",
    "11": "write",
    root: "none",
  },
};
