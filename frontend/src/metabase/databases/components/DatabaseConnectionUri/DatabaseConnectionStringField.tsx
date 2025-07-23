import { useDisclosure, useTimeout } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { Group, Icon, Text, Textarea, Transition } from "metabase/ui";
import type { Engine } from "metabase-types/api";

import { mapDatabaseValues } from "./databaseFieldMapper";
import { parseConnectionUri } from "./parseConnectionUri";

const supportedEngines = new Set(["PostgreSQL", "Snowflake"]);
export function DatabaseConnectionStringField({
  setFieldValue,
  engine,
}: {
  setFieldValue: (field: string, value: string | boolean) => void;
  engine: Engine | undefined;
}) {
  const [connectionString, setConnectionString] = useState("");
  const [opened, { open, close }] = useDisclosure(false);
  const { start: delayedClose, clear } = useTimeout(
    () => close(),
    FEEDBACK_TIMEOUT,
  );

  useEffect(
    function handleConnectionStringChange() {
      const parsedValues = parseConnectionUri(connectionString);
      if (parsedValues) {
        const fieldsMap = mapDatabaseValues(parsedValues);
        fieldsMap.forEach((value, field) => setFieldValue(field, value));
        open();
        delayedClose();

        return () => {
          clear();
        };
      }
      close();
    },
    [connectionString, setFieldValue, open, delayedClose, close, clear],
  );

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
