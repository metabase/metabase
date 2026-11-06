import { getSubmitValues } from "metabase/databases/utils/schema";
import { checkNotNull } from "metabase/utils/types";
import type { EngineKey } from "metabase-types/api";
import {
  createMockDatabaseData,
  createMockEngine,
} from "metabase-types/api/mocks";

import { mapDatabaseValues } from "./database-field-mapper";
import { parseConnectionUriRegex } from "./parse-connection-regex";

function mapConnectionString(
  connectionString: string,
  engineKey: EngineKey,
): Map<string, string | boolean | undefined> {
  const parsedValues = checkNotNull(
    parseConnectionUriRegex(connectionString, engineKey),
  );
  return mapDatabaseValues(parsedValues, engineKey);
}

describe.each<{
  engineKey: EngineKey;
  connectionString: string;
  additionalOptions: string;
}>([
  {
    engineKey: "mysql",
    connectionString:
      "jdbc:mysql://metabase:password@localhost:3304/sample?allowPublicKeyRetrieval=true&useSSL=false",
    additionalOptions: "allowPublicKeyRetrieval=true&useSSL=false",
  },
  {
    engineKey: "postgres",
    connectionString:
      "jdbc:postgresql://metabase:password@localhost:5404/sample?prepareThreshold=0&connectTimeout=10",
    additionalOptions: "prepareThreshold=0&connectTimeout=10",
  },
  {
    engineKey: "databricks",
    connectionString:
      "jdbc:databricks://example.cloud.databricks.com:443;httpPath=/sql/1.0/warehouses/abc;IgnoreTransactions=0",
    additionalOptions: "IgnoreTransactions=0",
  },
])(
  "mapDatabaseValues - $engineKey",
  ({ engineKey, connectionString, additionalOptions }) => {
    it("should preserve additional options in submitted connection details", () => {
      const fieldsMap = mapConnectionString(connectionString, engineKey);
      const engine = createMockEngine({
        "details-fields": [
          {
            name: "additional-options",
            "visible-if": { "advanced-options": true },
          },
        ],
      });
      const submitted = getSubmitValues(
        engine,
        createMockDatabaseData({
          name: "sample",
          engine: engineKey,
          details: {
            "advanced-options": fieldsMap.get("details.advanced-options"),
            "additional-options": fieldsMap.get("details.additional-options"),
          },
        }),
        true,
      );

      expect(submitted.details?.["additional-options"]).toBe(additionalOptions);
    });
  },
);

describe("mapDatabaseValues - redshift", () => {
  it("should map UID and PWD to dedicated fields and keep unmapped params in additional options", () => {
    const fieldsMap = mapConnectionString(
      "jdbc:redshift://a.b.us-west-2.redshift.amazonaws.com:5439/dbname;UID=amazon;PWD=password%3Apassword;ssl=true",
      "redshift",
    );

    expect(fieldsMap.get("details.host")).toBe(
      "a.b.us-west-2.redshift.amazonaws.com",
    );
    expect(fieldsMap.get("details.port")).toBe("5439");
    expect(fieldsMap.get("details.db")).toBe("dbname");
    expect(fieldsMap.get("details.user")).toBe("amazon");
    expect(fieldsMap.get("details.password")).toBe("password:password");
    expect(fieldsMap.get("details.additional-options")).toBe("ssl=true");
    expect(fieldsMap.get("details.advanced-options")).toBe(true);
  });

  it("should leave additional options empty when all params map to dedicated fields", () => {
    const fieldsMap = mapConnectionString(
      "jdbc:redshift://a.b.us-west-2.redshift.amazonaws.com:5439/dbname;UID=amazon;PWD=secret",
      "redshift",
    );

    expect(fieldsMap.get("details.additional-options")).toBe("");
    expect(fieldsMap.get("details.advanced-options")).toBeUndefined();
  });
});
