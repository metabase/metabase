import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Button, Icon, Tooltip } from "metabase/ui";

const LOADING_INDICATOR_DELAY_MS = 300;

const isLoadingStarting = (_lastValue: boolean, newValue: boolean) => newValue;

export type TestConnectionResult =
  | { status: "success" }
  | { status: "error"; message: string };

type TestResultAtValues = TestConnectionResult & { valuesAtTest: unknown };

const TestResultIcon = ({ result }: { result: TestConnectionResult }) =>
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

interface TestConnectionButtonProps {
  values: unknown;
  disabled?: boolean;
  "data-testid"?: string;
  onTest: () => Promise<TestConnectionResult | null>;
}

/** Runs `onTest` and shows its result next to the label until `values` changes. */
export const TestConnectionButton = ({
  values,
  disabled,
  "data-testid": dataTestId,
  onTest,
}: TestConnectionButtonProps) => {
  const [isTesting, setIsTesting] = useState(false);
  const showLoading = useDebouncedValue(
    isTesting,
    LOADING_INDICATOR_DELAY_MS,
    isLoadingStarting,
  );
  const [lastResult, setLastResult] = useState<TestResultAtValues | null>(null);

  // Formik replaces `values` on every edit, so a new reference means the result is stale
  const result = lastResult?.valuesAtTest === values ? lastResult : null;

  const handleClick = async () => {
    // the button stays clickable until the delayed loader appears
    if (isTesting) {
      return;
    }

    const valuesAtTest = values;
    setIsTesting(true);
    try {
      const testResult = await onTest();
      if (testResult) {
        setLastResult({ ...testResult, valuesAtTest });
      }
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Button
      data-testid={dataTestId}
      disabled={disabled}
      loading={showLoading}
      rightSection={result && <TestResultIcon result={result} />}
      onClick={handleClick}
    >
      {t`Test connection`}
    </Button>
  );
};
