import { type FormikErrors, useFormikContext } from "formik";
import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useListEnginesQuery, useValidateDatabaseMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Button, Icon, Tooltip } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

import { getSubmitValues } from "../../utils/schema";

import { getEngine } from "./utils";

const LOADING_INDICATOR_DELAY_MS = 300;

const isLoadingStarting = (_lastValue: boolean, newValue: boolean) => newValue;

type TestResult =
  | { status: "success"; valuesAtTest: DatabaseData }
  | { status: "error"; valuesAtTest: DatabaseData; message: string };

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

const TestResultIcon = ({ result }: { result: TestResult }) =>
  match(result)
    .with({ status: "success" }, () => (
      <Icon
        name="check_filled"
        c="feedback-positive"
        aria-label={t`Connection successful`}
      />
    ))
    .with({ status: "error" }, ({ message }) => (
      <Tooltip label={message} multiline maw="20rem">
        <Icon
          name="warning_round_filled"
          c="feedback-negative"
          aria-label={t`Connection failed`}
        />
      </Tooltip>
    ))
    .exhaustive();

export const DatabaseTestConnectionButton = () => {
  const { values, validateForm, setFieldError, setFieldTouched } =
    useFormikContext<DatabaseData>();
  const { data: engines = {} } = useListEnginesQuery();
  const [validateDatabase, { isLoading }] = useValidateDatabaseMutation();
  const showLoading = useDebouncedValue(
    isLoading,
    LOADING_INDICATOR_DELAY_MS,
    isLoadingStarting,
  );
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  // Formik replaces `values` on every edit, so a new reference means the result is stale
  const result = lastResult?.valuesAtTest === values ? lastResult : null;

  const handleTestConnection = async () => {
    // the button stays clickable until the delayed loader appears
    if (isLoading) {
      return;
    }

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
      const response = await validateDatabase({
        details: {
          engine: engineKey,
          details: submitValues.details ?? {},
          // lets the backend resolve details we sent back redacted
          ...(values.id != null && { id: values.id }),
        },
      }).unwrap();

      if (response.valid) {
        setLastResult({ status: "success", valuesAtTest: values });
        return;
      }

      Object.entries(response.errors ?? {}).forEach(([name, message]) => {
        setFieldTouched(`details.${name}`, true, false);
        setFieldError(`details.${name}`, message);
      });

      setLastResult({
        status: "error",
        valuesAtTest: values,
        message: response.message ?? t`Couldn't connect to the database`,
      });
    } catch (error) {
      setLastResult({
        status: "error",
        valuesAtTest: values,
        message: getErrorMessage(error, t`Couldn't connect to the database`),
      });
    }
  };

  return (
    <Button
      data-testid="database-test-connection-button"
      disabled={values.engine == null}
      loading={showLoading}
      rightSection={result && <TestResultIcon result={result} />}
      onClick={handleTestConnection}
    >
      {t`Test connection`}
    </Button>
  );
};
