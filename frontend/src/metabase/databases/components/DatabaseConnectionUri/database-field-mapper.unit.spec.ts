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
