import { checkNotNull } from "metabase/utils/types";

import { mapDatabaseValues } from "./database-field-mapper";
import { parseConnectionUriRegex } from "./parse-connection-regex";

function mapConnectionString(connectionString: string, engineKey: "redshift") {
  const parsedValues = checkNotNull(
    parseConnectionUriRegex(connectionString, engineKey),
  );
  return mapDatabaseValues(parsedValues, engineKey);
}

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
