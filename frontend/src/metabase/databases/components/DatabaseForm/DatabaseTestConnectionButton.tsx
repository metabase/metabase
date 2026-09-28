import { type FormikErrors, useFormikContext } from "formik";
import { t } from "ttag";

import { useValidateDatabaseMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useSetting } from "metabase/settings";
import { Button } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

import { getSubmitValues } from "../../utils/schema";

import { getEngine } from "./utils";

/** Formik types this as a string, but per-field errors arrive as an object keyed by field name */
const getDetailErrorPaths = (details: unknown): string[] => {
  if (typeof details === "object" && details !== null) {
    return Object.keys(details).map((name) => `details.${name}`);
  }

  return details ? ["details"] : [];
};

const getConnectionErrorPaths = ({
  engine,
  details,
}: FormikErrors<DatabaseData>) => [
  ...(engine ? ["engine"] : []),
  ...getDetailErrorPaths(details),
];

export const DatabaseTestConnectionButton = () => {
  const { values, validateForm, setFieldError, setFieldTouched } =
    useFormikContext<DatabaseData>();
  const engines = useSetting("engines");
  const [validateDatabase, { isLoading }] = useValidateDatabaseMutation();
  const [sendToast] = useToast();

  const handleTestConnection = async () => {
    const invalidPaths = getConnectionErrorPaths(await validateForm());

    if (invalidPaths.length > 0) {
      invalidPaths.forEach((path) => setFieldTouched(path, true, false));
      return;
    }

    const engineKey = values.engine;
    if (engineKey == null) {
      return;
    }

    const submitValues = getSubmitValues(
      getEngine(engines, engineKey),
      values,
      true,
    );

    try {
      const result = await validateDatabase({
        details: {
          engine: engineKey,
          details: submitValues.details ?? {},
          // lets the backend resolve details we sent back redacted
          ...(values.id != null && { id: values.id }),
        },
      }).unwrap();

      if (result.valid) {
        sendToast({ message: t`Connection successful`, icon: "check" });
        return;
      }

      Object.entries(result.errors ?? {}).forEach(([name, message]) => {
        setFieldTouched(`details.${name}`, true, false);
        setFieldError(`details.${name}`, message);
      });

      sendToast({
        message: result.message ?? t`Couldn't connect to the database`,
        icon: "warning",
      });
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't connect to the database`),
        icon: "warning",
      });
    }
  };

  return (
    <Button
      data-testid="database-test-connection-button"
      disabled={values.engine == null}
      loading={isLoading}
      onClick={handleTestConnection}
    >
      {t`Test connection`}
    </Button>
  );
};
