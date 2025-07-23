import { useDisclosure, useTimeout } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { Group, Icon, Text, Textarea, Transition } from "metabase/ui";
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
  const [opened, { open, close }] = useDisclosure(false);
  const { start: delayedClose, clear } = useTimeout(
    () => close(),
    FEEDBACK_TIMEOUT,
  );

  useEffect(() => {
    const parsedValues = parseConnectionUri(connectionString);
    if (parsedValues) {
      setDatabaseValue(parsedValues, setFieldValue);
      open();
      delayedClose();

      return () => {
        clear();
      };
    }
    close();
  }, [connectionString, setFieldValue, open, delayedClose, close, clear]);

  if (!supportedEngines.has(engine?.["driver-name"] ?? "")) {
    return null;
  }

  return (
    <Textarea
      inputWrapperOrder={["label", "input", "description", "error"]}
      label="Connection string (optional)"
      description={<ConnectionStringDescription opened={opened} />}
      value={connectionString}
      onChange={(e) => setConnectionString(e.target.value)}
      mb="md"
    />
  );
}

const FEEDBACK_TIMEOUT = 2000;
const TRANSITION_DURATION = 250;

function ConnectionStringDescription({ opened }: { opened: boolean }) {
  const defaultDescription = (
    <Transition
      mounted={!opened}
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

  const successMessage = (
    <Transition
      mounted={opened}
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
      {defaultDescription}
      {successMessage}
    </Group>
  );
}
