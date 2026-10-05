import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dump as dumpYaml } from "js-yaml";

import { repositorySchemaAction } from "./repository-schema";

const tableMeta = [
  { model: "Database", id: "DB" },
  { model: "Table", id: "orders" },
];
const measureMeta = [{ model: "Measure", id: "measure12345678901234" }];

function writeYaml(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, dumpYaml(value));
}

describe("repository schema generation", () => {
  let root: string;
  let appRoot: string;
  let previousUrl: string | undefined;
  let previousApiKey: string | undefined;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "repository-schema-"));
    appRoot = path.join(root, "data_apps", "orders");
    fs.mkdirSync(appRoot, { recursive: true });
    previousUrl = process.env.DATA_APP_MB_URL;
    previousApiKey = process.env.DATA_APP_MB_API_KEY;
    process.env.DATA_APP_MB_URL = "https://example.metabase.test";
    process.env.DATA_APP_MB_API_KEY = "test-key";

    writeYaml(path.join(root, "databases", "orders.yaml"), {
      "serdes/meta": tableMeta,
      name: "orders",
      fields: [{ name: "yaml_only_field", base_type: "type/Text" }],
    });
    writeYaml(path.join(root, "databases", "measure.yaml"), {
      "serdes/meta": measureMeta,
      name: "Latest order",
      definition: {
        stages: [
          {
            "source-table": ["DB", null, "orders"],
            aggregation: [
              ["max", {}, ["field", {}, ["DB", null, "orders", "created_at"]]],
            ],
          },
        ],
      },
    });

    fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/api/database")) {
          return Response.json({ data: [{ id: 1, name: "DB" }], total: 1 });
        }
        if (url.includes("/metadata?")) {
          return Response.json({
            id: 1,
            name: "DB",
            tables: [
              {
                id: 10,
                name: "orders",
                schema: null,
                fields: [
                  {
                    id: 100,
                    table_id: 10,
                    name: "created_at",
                    base_type: "type/DateTime",
                  },
                ],
              },
              { id: 11, name: "instance_only", schema: null, fields: [] },
            ],
          });
        }
        if (url.endsWith("/api/eid-translation/translate")) {
          return Response.json({
            entity_ids: { measure12345678901234: { status: "ok", id: 20 } },
          });
        }
        throw new Error(`Unexpected request ${url}`);
      });
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (previousUrl === undefined) {
      delete process.env.DATA_APP_MB_URL;
    } else {
      process.env.DATA_APP_MB_URL = previousUrl;
    }
    if (previousApiKey === undefined) {
      delete process.env.DATA_APP_MB_API_KEY;
    } else {
      process.env.DATA_APP_MB_API_KEY = previousApiKey;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("uses live fields and unsynced measure definitions without refreshing the field snapshot", async () => {
    await repositorySchemaAction({ appRoot, database: "DB" });
    const generatedFile = path.join(appRoot, "src", "metabase.data.ts");
    const first = fs.readFileSync(generatedFile, "utf8");
    expect(first).toContain('"jsType": "Date"');
    expect(first).toContain('"fieldId": 100');
    expect(first).toContain('"id": 20');
    expect(first).not.toContain("yaml_only_field");
    expect(first).not.toContain("instance_only");

    writeYaml(path.join(root, "databases", "measure.yaml"), {
      "serdes/meta": measureMeta,
      name: "Latest order",
      definition: {
        stages: [
          {
            "source-table": ["DB", null, "orders"],
            aggregation: [["count", {}]],
          },
        ],
      },
    });
    await repositorySchemaAction({ appRoot, database: "DB" });
    const second = fs.readFileSync(generatedFile, "utf8");
    expect(second).toContain('"jsType": "number"');
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/metadata?"),
      ),
    ).toHaveLength(1);

    const snapshotFile = path.join(
      appRoot,
      "node_modules",
      ".cache",
      "metabase-schema-metadata.json",
    );
    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    fs.writeFileSync(
      snapshotFile,
      JSON.stringify({ ...snapshot, fetchedAt: 0 }),
    );
    await repositorySchemaAction({ appRoot, database: "DB" });
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/metadata?"),
      ),
    ).toHaveLength(2);
    const refreshed = fs.readFileSync(generatedFile, "utf8");

    fetchMock.mockRejectedValueOnce(new Error("refresh failed"));
    await expect(
      repositorySchemaAction({ appRoot, database: "DB", forceRefresh: true }),
    ).rejects.toThrow("refresh failed");
    expect(fs.readFileSync(generatedFile, "utf8")).toBe(refreshed);
  });

  it("selects published tables through the repository Data library hierarchy", async () => {
    writeYaml(path.join(root, "collections", "data.yaml"), {
      "serdes/meta": [{ model: "Collection", id: "librarylibrarydatadat" }],
      entity_id: "librarylibrarydatadat",
      type: "library-data",
    });
    writeYaml(path.join(root, "collections", "child.yaml"), {
      "serdes/meta": [{ model: "Collection", id: "childcollection1234567" }],
      entity_id: "childcollection1234567",
      parent_id: "librarylibrarydatadat",
      type: "library-data",
    });
    writeYaml(path.join(root, "databases", "orders.yaml"), {
      "serdes/meta": tableMeta,
      name: "orders",
      is_published: true,
      collection_id: "childcollection1234567",
    });

    await repositorySchemaAction({ appRoot, includeDataLibrary: true });

    const generated = fs.readFileSync(
      path.join(appRoot, "src", "metabase.data.ts"),
      "utf8",
    );
    expect(generated).toContain('"id": 10');
    expect(generated).not.toContain("instance_only");
  });

  it("generates a table represented only by user settings", async () => {
    const publicTableMeta = [
      { model: "Database", id: "DB" },
      { model: "Schema", id: "public" },
      { model: "Table", id: "orders" },
    ];

    writeYaml(path.join(root, "databases", "orders.yaml"), {
      "serdes/meta": [
        ...publicTableMeta,
        { model: "TableUserSettings", id: "1" },
      ],
      display_name: "Customer orders",
      is_published: true,
      fields: [{ "serdes/meta": [{ model: "FieldUserSettings", id: "1" }] }],
    });
    writeYaml(path.join(root, "databases", "measure.yaml"), {
      "serdes/meta": measureMeta,
      name: "Latest order",
      definition: {
        stages: [
          {
            "source-table": ["DB", "public", "orders"],
            aggregation: [
              [
                "max",
                {},
                ["field", {}, ["DB", "public", "orders", "created_at"]],
              ],
            ],
          },
        ],
      },
    });
    fetchMock.mockResolvedValueOnce(
      Response.json({ data: [{ id: 1, name: "DB" }], total: 1 }),
    );
    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: 1,
        name: "DB",
        tables: [
          {
            id: 10,
            name: "orders",
            schema: "public",
            fields: [
              {
                id: 100,
                table_id: 10,
                name: "created_at",
                base_type: "type/DateTime",
              },
            ],
          },
        ],
      }),
    );

    await repositorySchemaAction({ appRoot, database: "DB" });

    const generated = fs.readFileSync(
      path.join(appRoot, "src", "metabase.data.ts"),
      "utf8",
    );
    expect(generated).toContain('"customerOrders"');
    expect(generated).toContain('"fieldId": 100');
    expect(generated).toContain('"latestOrder"');
  });

  it("merges user settings into a separate table representation", async () => {
    writeYaml(path.join(root, "databases", "orders-settings.yaml"), {
      "serdes/meta": [...tableMeta, { model: "TableUserSettings", id: "1" }],
      display_name: "Customer orders",
      is_published: true,
      collection_id: "librarylibrarydatadat",
    });
    writeYaml(path.join(root, "collections", "data.yaml"), {
      "serdes/meta": [{ model: "Collection", id: "librarylibrarydatadat" }],
      entity_id: "librarylibrarydatadat",
      type: "library-data",
    });

    await repositorySchemaAction({ appRoot, includeDataLibrary: true });

    const generated = fs.readFileSync(
      path.join(appRoot, "src", "metabase.data.ts"),
      "utf8",
    );
    expect(generated).toContain('"customerOrders"');
    expect(generated).toContain('"fieldId": 100');
  });

  it("rejects a scope with no represented tables", async () => {
    const target = path.join(appRoot, "src", "metabase.data.ts");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "previous schema");

    await expect(
      repositorySchemaAction({ appRoot, database: "Missing" }),
    ).rejects.toThrow(/database Missing.*0 tables.*YAML files/);

    expect(fs.readFileSync(target, "utf8")).toBe("previous schema");
  });

  it("keeps the generated file when a repository measure has no instance ID", async () => {
    await repositorySchemaAction({ appRoot, database: "DB" });
    const generatedFile = path.join(appRoot, "src", "metabase.data.ts");
    const previous = fs.readFileSync(generatedFile, "utf8");
    fetchMock.mockResolvedValueOnce(
      Response.json({
        entity_ids: { measure12345678901234: { status: "not-found" } },
      }),
    );

    await expect(
      repositorySchemaAction({ appRoot, database: "DB" }),
    ).rejects.toThrow("not-found");
    expect(fs.readFileSync(generatedFile, "utf8")).toBe(previous);
  });

  it("includes all databases with the selected name and keeps table keys distinct", async () => {
    writeYaml(path.join(root, "databases", "measure.yaml"), {
      "serdes/meta": measureMeta,
      name: "Orders",
      definition: {
        stages: [
          {
            "source-table": ["DB", null, "orders"],
            aggregation: [["count", {}]],
          },
        ],
      },
    });
    fetchMock.mockResolvedValueOnce(
      Response.json({
        data: [
          { id: 1, name: "DB" },
          { id: 2, name: "DB" },
        ],
        total: 2,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: 1,
        name: "DB",
        tables: [{ id: 10, name: "orders", schema: null, fields: [] }],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: 2,
        name: "DB",
        tables: [{ id: 12, name: "orders", schema: null, fields: [] }],
      }),
    );

    await repositorySchemaAction({ appRoot, database: "DB" });

    const generated = fs.readFileSync(
      path.join(appRoot, "src", "metabase.data.ts"),
      "utf8",
    );
    expect(generated).toContain('"orders10"');
    expect(generated).toContain('"orders12"');
  });
});
