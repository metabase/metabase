import { useTimeout } from "@mantine/hooks";
import type { FormikErrors } from "formik";
import { useEffect, useState } from "react";
import { c, t } from "ttag";

import { Group, Icon, Text, Textarea, Transition } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";
import { type EngineKey, engineKeys } from "metabase-types/api/settings";

import {
  connectionStringParsedFailed,
  connectionStringParsedSuccess,
} from "./analytics";
import {
  mapDatabaseValues,
  mapFieldsToNestedObject,
} from "./database-field-mapper";
import { enginesConfig } from "./engines-config";
import { parseConnectionUriRegex } from "./parse-connection-regex";

/**
 * Type guard function that checks if a string is a valid EngineKey
 */
export function isEngineKey(value: string | undefined): value is EngineKey {
  return engineKeys.includes(value as EngineKey);
}

export function DatabaseConnectionStringField({
  setValues,
  engineKey,
  location,
}: {
  setValues: (
    values: DatabaseData,
    shouldValidate: boolean,
  ) => Promise<void | FormikErrors<DatabaseData>>;
  engineKey: string | undefined;
  location: "admin" | "setup" | "embedding_setup";
}) {
  const [connectionString, setConnectionString] = useState("");
  const [status, setStatus] = useState<"success" | "failure" | null>(null);
  const { start: deleayedClearStatus, clear: clearTimeout } = useTimeout(
    () => setStatus(null),
    FEEDBACK_TIMEOUT,
  );

  useEffect(() => {
    setConnectionString("");
  }, [engineKey]);

  useEffect(
    () => {
      async function handleConnectionStringChange() {
        if (!connectionString || !isEngineKey(engineKey)) {
          deleayedClearStatus();
          return () => clearTimeout();
        }

        const parsedValues = parseConnectionUriRegex(connectionString);

        // it was not possible to parse the connection string
        if (!parsedValues) {
          setStatus("failure");
          deleayedClearStatus();
          connectionStringParsedFailed(location);
          return () => clearTimeout();
        }

        const fieldsMap = mapDatabaseValues(parsedValues, engineKey);
        const fields = mapFieldsToNestedObject(fieldsMap) as DatabaseData;
        await setValues(fields, true);

        // if there are no values, we couldn't get any details from the connection string
        const hasValues = hasNonUndefinedValue(fieldsMap);
        setStatus(hasValues ? "success" : "failure");

        deleayedClearStatus();
        connectionStringParsedSuccess(location);

        return () => {
          clearTimeout();
        };
      }

      handleConnectionStringChange();
    },
    // We don't want to rerun this effect when engineKey changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectionString, setValues, deleayedClearStatus, clearTimeout, setStatus],
  );

  if (!isEngineKey(engineKey)) {
    return null;
  }

  if (!enginesConfig.has(engineKey ?? "")) {
    return null;
  }

  const placeholderEngineUri = enginesConfig.get(engineKey ?? "")?.placeholder;
  const placeholder = c("{0} is the value is a sample URI of engine")
    .t`e.g. ${placeholderEngineUri}`;

  return (
    <Textarea
      inputWrapperOrder={["label", "input", "description", "error"]}
      label="Connection string (optional)"
      description={<ConnectionStringDescription status={status} />}
      value={connectionString}
      onChange={(e) => setConnectionString(e.target.value)}
      mb="md"
      placeholder={placeholder}
      name="connection-string"
    />
  );
}

const FEEDBACK_TIMEOUT = 2000;
const TRANSITION_DURATION = 250;
const TRANSITION = "fade";

function ConnectionStringDescription({
  status,
}: {
  status: "success" | "failure" | null;
}) {
  const defaultDescription = (
    <Transition
      mounted={status === null}
      transition={TRANSITION}
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
      transition={TRANSITION}
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
      transition={TRANSITION}
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
