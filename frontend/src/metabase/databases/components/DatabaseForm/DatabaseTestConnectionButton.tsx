import { type FormikErrors, useFormikContext } from "formik";
import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListEnginesQuery, useValidateDatabaseMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  TestConnectionButton,
  type TestConnectionResult,
} from "metabase/common/components/TestConnectionButton";
import type {
  DatabaseData,
  Engine,
  ValidateDatabaseRequest,
  ValidateDatabaseResponse,
} from "metabase-types/api";

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

const getValidateRequest = (
  engines: Record<string, Engine>,
  values: DatabaseData,
): ValidateDatabaseRequest | null => {
  const engineKey = values.engine;
  if (engineKey == null) {
    return null;
  }

  const submitValues = getSubmitValues(
    getEngine(engines, engineKey),
    values,
    true,
  );

  return {
    details: {
      engine: engineKey,
      details: submitValues.details ?? {},
      // lets the backend resolve details we sent back redacted
      ...(values.id != null && { id: values.id }),
    },
  };
};

const getTestResult = (
  data: ValidateDatabaseResponse | undefined,
  error: unknown,
): TestConnectionResult | null => {
  if (error != null) {
    return {
      status: "error",
      message: getErrorMessage(error, t`Couldn't connect to the database`),
    };
  }

  if (data == null) {
    return null;
  }

  return data.valid
    ? { status: "success" }
    : {
        status: "error",
        message: data.message ?? t`Couldn't connect to the database`,
      };
};

export const DatabaseTestConnectionButton = () => {
  const { values, validateForm, setFieldError, setFieldTouched } =
    useFormikContext<DatabaseData>();
  const { data: engines = {} } = useListEnginesQuery();
  const [validateDatabase, { data, error, isLoading, originalArgs }] =
    useValidateDatabaseMutation();
  const request = useMemo(
    () => getValidateRequest(engines, values),
    [engines, values],
  );
  const result = _.isEqual(originalArgs, request)
    ? getTestResult(data, error)
    : null;

  const handleTestConnection = async () => {
    const invalidPaths = getConnectionErrorPaths(await validateForm());

    if (invalidPaths.length > 0) {
      invalidPaths.forEach((path) => setFieldTouched(path, true, false));
      return;
    }

    if (request == null) {
      return;
    }

    const { data: response } = await validateDatabase(request);
    Object.entries(response?.errors ?? {}).forEach(([name, message]) => {
      setFieldTouched(`details.${name}`, true, false);
      setFieldError(`details.${name}`, message);
    });
  };

  return (
    <TestConnectionButton
      data-testid="database-test-connection-button"
      result={result}
      isLoading={isLoading}
      disabled={values.engine == null}
      onClick={handleTestConnection}
    />
  );
};
