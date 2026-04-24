import { Button } from "metabase/ui";

import { getUpdateButtonProps } from "./getUpdateButtonProps";

interface UpdateButtonProps {
  value: unknown;
  unsavedValue: unknown;
  defaultValue: unknown;
  isValueRequired: boolean;
  isValid?: boolean;
  positional?: boolean;
}

export function UpdateFilterButton(props: UpdateButtonProps) {
  const {
    value,
    unsavedValue,
    defaultValue,
    isValueRequired,
    isValid,
    positional,
  } = props;

  const { label, isDisabled } = getUpdateButtonProps(
    value,
    unsavedValue,
    defaultValue,
    isValueRequired,
    positional,
  );

  return (
    <Button
      type="submit"
      disabled={isDisabled || !isValid}
      variant="filled"
      aria-label={label}
    >
      {label}
    </Button>
  );
}
