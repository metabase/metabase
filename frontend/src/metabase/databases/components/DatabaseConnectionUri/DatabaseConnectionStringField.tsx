import { useEffect, useState } from "react";

import { Textarea } from "metabase/ui";
import type { Engine } from "metabase-types/api";

import { parseConnectionUri } from "./parseConnectionUri";

const supportedEngines = new Set(["PostgreSQL"]);
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
      setFieldValue("details.host", parsedValues.host);
      setFieldValue("details.port", parsedValues.port);
      setFieldValue("details.dbname", parsedValues.database);
      setFieldValue("details.user", parsedValues.username);
      setFieldValue("details.password", parsedValues.password);
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
