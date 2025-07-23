import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { Group, Icon, Stack, Textarea } from "metabase/ui";
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
    case "postgres":
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
  const [opened, handlers] = useDisclosure(false);

  useEffect(() => {
    const parsedValues = parseConnectionUri(connectionString);
    if (parsedValues) {
      setDatabaseValue(parsedValues, setFieldValue);
      handlers.open();
    }
  }, [connectionString, setFieldValue, handlers]);

  if (!supportedEngines.has(engine?.["driver-name"] ?? "")) {
    return null;
  }

  const description = t`You can use a connection string to pre-fill the details below.`;
  const successMessage = (
    <Group gap="xs">
      <Icon name="check_filled" style={{ color: "var(--mb-color-success)" }} />
      {t`Connection string parsed successfully.`}
    </Group>
  );

  return (
    <Stack gap={0}>
      <Textarea
        inputWrapperOrder={["label", "input", "description", "error"]}
        label="Connection string (optional)"
        description={opened ? successMessage : description}
        value={connectionString}
        onChange={(e) => setConnectionString(e.target.value)}
        mb="md"
      />
    </Stack>
  );
}
