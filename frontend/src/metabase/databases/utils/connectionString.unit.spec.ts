import type { Engine } from "metabase-types/api";

import { parseConnectionString } from "./connectionString";

const TEST_ENGINES: Record<string, Engine> = {
  postgres: {
    "driver-name": "PostgreSQL",
    "details-fields": [
      { name: "host", placeholder: "localhost" },
      { name: "port", placeholder: 5432 },
      { name: "dbname" },
      { name: "user" },
      { name: "password" },
      { name: "ssl" },
      { name: "ssl-mode" },
      { name: "additional-options" },
    ],
    source: { type: "official", contact: null },
    "superseded-by": null,
  },
  mysql: {
    "driver-name": "MySQL",
    "details-fields": [
      { name: "host", placeholder: "localhost" },
      { name: "port", placeholder: 3306 },
      { name: "dbname" },
      { name: "user" },
      { name: "password" },
      { name: "additional-options" },
    ],
    source: { type: "official", contact: null },
    "superseded-by": null,
  },
  sqlserver: {
    "driver-name": "SQL Server",
    "details-fields": [
      { name: "host" },
      { name: "port", placeholder: 1433 },
      { name: "dbname" },
      { name: "user" },
      { name: "password" },
    ],
    source: { type: "official", contact: null },
    "superseded-by": null,
  },
  oracle: {
    "driver-name": "Oracle",
    "details-fields": [
      { name: "host" },
      { name: "port", placeholder: 1521 },
      { name: "sid" },
      { name: "user" },
      { name: "password" },
    ],
    source: { type: "official", contact: null },
    "superseded-by": null,
  },
};

describe("parseConnectionString", () => {
  it("should parse a basic PostgreSQL connection string", () => {
    const connectionString = "postgresql://user:pass@localhost:5432/mydb";
    const result = parseConnectionString(
      connectionString,
      TEST_ENGINES,
      TEST_ENGINES.postgres,
    );

    expect(result.isValid).toBe(true);
    expect(result.engineKey).toBe("postgres");
    expect(result.fieldValues).toEqual({
      "details.host": "localhost",
      "details.port": "5432",
      "details.dbname": "mydb",
      name: "mydb",
      "details.user": "user",
      "details.password": "pass",
    });
  });

  it("should parse a connection string with a different provider mapping", () => {
    const connectionString =
      "mssql://user:pass@sqlserver.example.com:1433/adventureworks";
    const result = parseConnectionString(
      connectionString,
      TEST_ENGINES,
      TEST_ENGINES.sqlserver,
    );

    expect(result.isValid).toBe(true);
    expect(result.engineKey).toBe("sqlserver");
    expect(result.fieldValues).toEqual({
      "details.host": "sqlserver.example.com",
      "details.port": "1433",
      "details.dbname": "adventureworks",
      name: "adventureworks",
      "details.user": "user",
      "details.password": "pass",
    });
  });

  it("should parse a connection string without credentials", () => {
    const connectionString = "postgres://localhost/mydb";
    const result = parseConnectionString(
      connectionString,
      TEST_ENGINES,
      TEST_ENGINES.postgres,
    );

    expect(result.isValid).toBe(true);
    expect(result.engineKey).toBe("postgres");
    expect(result.fieldValues).toEqual({
      "details.host": "localhost",
      "details.port": 5432,
      "details.dbname": "mydb",
      name: "mydb",
    });
  });

  it("should parse a connection string with SSL mode", () => {
    const connectionString = "postgres://localhost/mydb?sslmode=require";
    const result = parseConnectionString(
      connectionString,
      TEST_ENGINES,
      TEST_ENGINES.postgres,
    );

    expect(result.isValid).toBe(true);
    expect(result.fieldValues["details.ssl"]).toBe(true);
    expect(result.fieldValues["details.ssl-mode"]).toBe("require");
    expect(result.fieldValues["details.additional-options"]).toBe("");
  });

  it("should handle additional options", () => {
    const connectionString =
      "postgres://localhost/mydb?connect_timeout=10&application_name=myapp&sslmode=verify-full";
    const result = parseConnectionString(
      connectionString,
      TEST_ENGINES,
      TEST_ENGINES.postgres,
    );

    expect(result.isValid).toBe(true);
    expect(result.fieldValues["details.ssl"]).toBe(true);
    expect(result.fieldValues["details.ssl-mode"]).toBe("verify-full");
    expect(result.fieldValues["details.additional-options"]).toBe(
      "connect_timeout=10&application_name=myapp",
    );
  });

  it("should return invalid for malformed connection strings", () => {
    const connectionString = "not-a-valid-connection-string";
    const result = parseConnectionString(
      connectionString,
      TEST_ENGINES,
      TEST_ENGINES.postgres,
    );

    expect(result.isValid).toBe(false);
  });

  it("should handle connection strings without provider", () => {
    const connectionString = "user:pass@localhost:5432/mydb";
    const result = parseConnectionString(
      connectionString,
      TEST_ENGINES,
      TEST_ENGINES.postgres,
    );

    expect(result.isValid).toBe(true);
    expect(result.engineKey).toBeUndefined();
    expect(result.fieldValues).toEqual({
      "details.host": "localhost",
      "details.port": "5432",
      "details.dbname": "mydb",
      name: "mydb",
      "details.user": "user",
      "details.password": "pass",
    });
  });

  it("should find engine by driver name", () => {
    const connectionString = "postgresql://localhost/mydb";
    const result = parseConnectionString(
      connectionString,
      TEST_ENGINES,
      undefined,
    );

    expect(result.isValid).toBe(true);
    expect(result.engineKey).toBe("postgres");
  });
});
