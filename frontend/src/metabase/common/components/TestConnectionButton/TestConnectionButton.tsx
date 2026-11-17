import { match } from "ts-pattern";
import { t } from "ttag";

import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Button, Icon, Tooltip } from "metabase/ui";

const LOADING_INDICATOR_DELAY_MS = 300;

const isLoadingStarting = (_lastValue: boolean, newValue: boolean) => newValue;

export type TestConnectionResult =
  | { status: "success" }
  | { status: "error"; message: string };

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
  result: TestConnectionResult | null;
  isLoading: boolean;
  disabled?: boolean;
  "data-testid"?: string;
  onClick: () => void;
}

/** Renders a "Test connection" button with a delayed loader and the `result` icon. */
export const TestConnectionButton = ({
  result,
  isLoading,
  disabled,
  "data-testid": dataTestId,
  onClick,
}: TestConnectionButtonProps) => {
  const showLoading = useDebouncedValue(
    isLoading,
    LOADING_INDICATOR_DELAY_MS,
    isLoadingStarting,
  );

  const handleClick = () => {
    // the button stays clickable until the delayed loader appears
    if (!isLoading) {
      onClick();
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
