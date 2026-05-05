import { usePrevious, useTimeout } from "@mantine/hooks";
import type { FormikErrors } from "formik";
import { useField } from "formik";
import { type SetStateAction, useEffect, useRef, useState } from "react";
import { c, t } from "ttag";

import { Group, Icon, Text, Textarea, Transition } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";
import { isEngineKey } from "metabase-types/guards";

import type { FormLocation } from "../../types";
import { setDatabaseFormValues } from "../../utils/schema";
import { getSharedFieldStyleProps } from "../styles";

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

export function DatabaseConnectionStringField({
  setValues,
  engineKey,
  location,
}: {
  setValues: (
    values: SetStateAction<DatabaseData>,
    shouldValidate?: boolean,
  ) => Promise<void | FormikErrors<DatabaseData>>;
  engineKey: string | undefined;
  location: FormLocation;
}) {
  const [status, setStatus] = useState<"success" | "failure" | null>(null);
  const lastParseStatusRef = useRef<"success" | "failure" | null>(null);
  const { start: delayedClearStatus, clear: clearTimeout } = useTimeout(
    () => setStatus(null),
    FEEDBACK_TIMEOUT,
  );
  const previousEngineKey = usePrevious(engineKey);
  const [{ value: connectionString }, , { setValue: setConnectionString }] =
    useField("connection-string");

  useEffect(() => {
    async function handleConnectionStringChange() {
      if (!connectionString || !isEngineKey(engineKey)) {
        lastParseStatusRef.current = null;
        delayedClearStatus();
        return () => clearTimeout();
      }

      const parsedValues = parseConnectionUriRegex(connectionString, engineKey);

      // it was not possible to parse the connection string
      if (!parsedValues) {
        setStatus("failure");
        lastParseStatusRef.current = "failure";
        delayedClearStatus();
        return () => clearTimeout();
      }

      const fieldsMap = mapDatabaseValues(parsedValues, engineKey);
      const fields = mapFieldsToNestedObject(fieldsMap) as DatabaseData;
      await setValues((previousValues) =>
        setDatabaseFormValues(previousValues, fields),
      );

      // if there are no values, we couldn't get any details from the connection string
      const hasValues = hasNonUndefinedValue(fieldsMap);
      const result = hasValues ? "success" : "failure";
      setStatus(result);
      lastParseStatusRef.current = result;

      delayedClearStatus();

      return () => {
        clearTimeout();
      };
    }

    // We don't want to rerun this effect when engineKey changes
    // The connection string field is cleared on the engine change
    if (previousEngineKey !== engineKey) {
      return;
    }

    handleConnectionStringChange();
  }, [
    connectionString,
    setValues,
    delayedClearStatus,
    clearTimeout,
    setStatus,
    previousEngineKey,
    engineKey,
    location,
    setConnectionString,
  ]);

  function handleBlur() {
    if (lastParseStatusRef.current === "success") {
      connectionStringParsedSuccess(location);
    }

    if (lastParseStatusRef.current === "failure") {
      connectionStringParsedFailed(location);
    }

    lastParseStatusRef.current = null;
  }

  if (!isEngineKey(engineKey)) {
    return null;
  }

  if (!enginesConfig[engineKey ?? ""]) {
    return null;
  }

  const placeholderEngineUri = enginesConfig[engineKey ?? ""];
  const placeholder = c("{0} is the value is a sample URI of engine")
    .t`e.g. ${placeholderEngineUri}`;

  return (
    <Textarea
      inputWrapperOrder={["label", "input", "description", "error"]}
      label="Connection string (optional)"
      description={<ConnectionStringDescription status={status} />}
      value={connectionString}
      onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setConnectionString(event.target.value);
      }}
      placeholder={placeholder}
      name="connection-string"
      onBlur={handleBlur}
      {...getSharedFieldStyleProps()}
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
        <Group style={styles} top={0} pos="absolute" h="lg" component="span">
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
          component="span"
        >
          <Group gap="xs" component="span">
            <Icon name="warning_round_filled" c="danger" />
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
          component="span"
        >
          <Group gap="xs" component="span">
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
    <Group h="lg" pos="relative" component="span">
      {failureMessage}
      {defaultDescription}
      {successMessage}
    </Group>
  );
}

function hasNonUndefinedValue(map: Map<string, string | boolean | undefined>) {
  return Array.from(map.values()).some((value) => value !== undefined);
}
