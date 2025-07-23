import { useEffect, useState } from "react";

import { Textarea } from "metabase/ui";
import type { Engine } from "metabase-types/api";

import { type UriFields, parseConnectionUri } from "./parseConnectionUri";

function setSnowflakeValues(
  parsedValues: UriFields,
  setFieldValue: (field: string, value: string) => void,
) {
  const { db, warehouse } = parsedValues.searchParams;
  setFieldValue("details.account", parsedValues.host);
  setFieldValue("details.db", db);
  setFieldValue("details.user", parsedValues.username);
  setFieldValue("details.warehouse", warehouse);
  if (parsedValues.password) {
    setFieldValue("details.use-password", parsedValues.password);
    setFieldValue("details.password", parsedValues.password);
  }
}

function setDatabaseValue(
  parsedValues: UriFields,
  setFieldValue: (field: string, value: string) => void,
) {
  switch (parsedValues.protocol) {
    case "postgresql":
      setFieldValue("details.host", parsedValues.host);
      setFieldValue("details.port", parsedValues.port);
      setFieldValue("details.dbname", parsedValues.database);
      setFieldValue("details.user", parsedValues.username);
      setFieldValue("details.password", parsedValues.password);
      break;
    case "snowflake":
      setSnowflakeValues(parsedValues, setFieldValue);
      break;
  }
}

const supportedEngines = new Set(["PostgreSQL", "Snowflake"]);
export function DatabaseConnectionStringField({
  setFieldValue,
  engine,
}: {
  setFieldValue: (field: string, value: string) => void;
  engine: Engine | undefined;
}) {
  const [connectionString, setConnectionString] = useState("");
  useEffect(() => {
    const parsedValues = parseConnectionUri(connectionString);
    if (parsedValues) {
      setDatabaseValue(parsedValues, setFieldValue);
    }
  }, [connectionString, setFieldValue]);

  if (!supportedEngines.has(engine?.["driver-name"] ?? "")) {
    return null;
  }

  return (
    <Textarea
      label="Connection string (optional)"
      description="You can use a connection string to pre-fill the details below."
      value={connectionString}
      onChange={(e) => setConnectionString(e.target.value)}
      mb="md"
    />
  );
}
