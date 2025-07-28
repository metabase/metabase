import { useTimeout } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { Group, Icon, Text, Textarea, Transition } from "metabase/ui";
import type { Engine } from "metabase-types/api";

import { mapDatabaseValues } from "./databaseFieldMapper";
import { parseConnectionUriRegex } from "./parseConnectionRegex";

const supportedEngines = new Set([
  "Amazon Athena",
  "Amazon Redshift",
  "BigQuery",
  "ClickHouse",
  "Databricks",
  "Druid",
  "Druid JDBC",
  "MySQL",
  "Oracle",
  "PostgreSQL",
  "Presto",
  "Snowflake",
  "Spark SQL",
  "SQL Server",
  "Starburst (Trino)",
]);

export function DatabaseConnectionStringField({
  setFieldValue,
  engine,
}: {
  setFieldValue: (field: string, value: string | boolean | undefined) => void;
  engine: Engine | undefined;
}) {
  const [connectionString, setConnectionString] = useState("");
  const [status, setStatus] = useState<"success" | "failure" | null>(null);
  const { start: deleayedClearStatus, clear: clearTimeout } = useTimeout(
    () => setStatus(null),
    FEEDBACK_TIMEOUT,
  );

  useEffect(
    function handleConnectionStringChange() {
      if (!connectionString) {
        deleayedClearStatus();
        return () => clearTimeout();
      }

      const parsedValues = parseConnectionUriRegex(connectionString);

      // it was not possible to parse the connection string
      if (!parsedValues) {
        setStatus("failure");
        deleayedClearStatus();
        return () => clearTimeout();
      }

      const fieldsMap = mapDatabaseValues(parsedValues);
      // if there are no values, we couldn't get any details from the connection string
      const hasValues = hasNonUndefinedValue(fieldsMap);
      fieldsMap.forEach((value, field) => setFieldValue(field, value));
      setStatus(hasValues ? "success" : "failure");
      deleayedClearStatus();

      return () => {
        clearTimeout();
      };
    },
    [
      connectionString,
      setFieldValue,
      deleayedClearStatus,
      clearTimeout,
      setStatus,
    ],
  );

  if (!supportedEngines.has(engine?.["driver-name"] ?? "")) {
    return null;
  }

  return (
    <Textarea
      inputWrapperOrder={["label", "input", "description", "error"]}
      label="Connection string (optional)"
      description={<ConnectionStringDescription status={status} />}
      value={connectionString}
      onChange={(e) => setConnectionString(e.target.value)}
      mb="md"
    />
  );
}

const FEEDBACK_TIMEOUT = 2000;
const TRANSITION_DURATION = 250;

function ConnectionStringDescription({
  status,
}: {
  status: "success" | "failure" | null;
}) {
  const defaultDescription = (
    <Transition
      mounted={status === null}
      transition="fade-right"
      duration={TRANSITION_DURATION}
      timingFunction="ease"
      exitDelay={0}
    >
      {(styles) => (
        <Group style={styles} top={0} pos="absolute" h="lg">
          {t`You can use a connection string to pre-fill the details below.`}
        </Group>
      )}
    </Transition>
  );

  const failureMessage = (
    <Transition
      mounted={status === "failure"}
      transition="fade-right"
      duration={TRANSITION_DURATION}
      timingFunction="ease"
    >
      {(styles) => (
        <Text
          style={styles}
          pos="absolute"
          top={0}
          c="danger"
          fw="bold"
          fz="sm"
        >
          <Group gap="xs">
            <Icon
              name="warning_round_filled"
              style={{ color: "var(--mb-color-danger)" }}
            />
            {t`Couldn’t use this connection string.`}
          </Group>
        </Text>
      )}
    </Transition>
  );

  const successMessage = (
    <Transition
      mounted={status === "success"}
      transition="fade-right"
      duration={TRANSITION_DURATION}
      timingFunction="ease"
    >
      {(styles) => (
        <Text
          style={styles}
          pos="absolute"
          top={0}
          c="success"
          fw="bold"
          fz="sm"
        >
          <Group gap="xs">
            <Icon
              name="check_filled"
              style={{ color: "var(--mb-color-success)" }}
            />
            {t`Connection details pre-filled below.`}
          </Group>
        </Text>
      )}
    </Transition>
  );
  return (
    <Group
      h="lg"
      pos="relative"
      style={{
        justifyContent: "flex-start",
      }}
    >
      {failureMessage}
      {defaultDescription}
      {successMessage}
    </Group>
  );
}

function hasNonUndefinedValue(map: Map<string, string | boolean | undefined>) {
  return Array.from(map.values()).some((value) => value !== undefined);
}
