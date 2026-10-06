import { type FormikErrors, useFormikContext } from "formik";
import { t } from "ttag";

import { useListEnginesQuery, useValidateDatabaseMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  TestConnectionButton,
  type TestConnectionResult,
} from "metabase/common/components/TestConnectionButton";
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
  const { data: engines = {} } = useListEnginesQuery();
  const [validateDatabase] = useValidateDatabaseMutation();

  const handleTestConnection =
    async (): Promise<TestConnectionResult | null> => {
      const invalidPaths = getConnectionErrorPaths(await validateForm());

      if (invalidPaths.length > 0) {
        invalidPaths.forEach((path) => setFieldTouched(path, true, false));
        return null;
      }

      const engineKey = values.engine;
      if (engineKey == null) {
        return null;
      }

      const submitValues = getSubmitValues(
        getEngine(engines, engineKey),
        values,
        true,
      );

      try {
        const response = await validateDatabase({
          details: {
            engine: engineKey,
            details: submitValues.details ?? {},
            // lets the backend resolve details we sent back redacted
            ...(values.id != null && { id: values.id }),
          },
        }).unwrap();

        if (response.valid) {
          return { status: "success" };
        }

        Object.entries(response.errors ?? {}).forEach(([name, message]) => {
          setFieldTouched(`details.${name}`, true, false);
          setFieldError(`details.${name}`, message);
        });

        return {
          status: "error",
          message: response.message ?? t`Couldn't connect to the database`,
        };
      } catch (error) {
        return {
          status: "error",
          message: getErrorMessage(error, t`Couldn't connect to the database`),
        };
      }
    };

  return (
    <TestConnectionButton
      data-testid="database-test-connection-button"
      values={values}
      disabled={values.engine == null}
      onTest={handleTestConnection}
    />
  );
};
