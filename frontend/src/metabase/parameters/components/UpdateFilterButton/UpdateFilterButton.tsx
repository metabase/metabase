import { Button } from "metabase/ui";

import { getUpdateButtonProps } from "./getUpdateButtonProps";

interface UpdateButtonProps {
  value: unknown;
  unsavedValue: unknown;
  defaultValue: unknown;
  isValueRequired: boolean;
  isValid?: boolean;
  onClick?: () => void;
}

export function UpdateFilterButton(props: UpdateButtonProps) {
  const {
    value,
    unsavedValue,
    defaultValue,
    isValueRequired,
    isValid,
    onClick = () => {},
  } = props;

  const { label, isDisabled } = getUpdateButtonProps(
    value,
    unsavedValue,
    defaultValue,
    isValueRequired,
  );

  return (
    <Button
      disabled={isDisabled || !isValid}
      onClick={onClick}
      variant="filled"
      aria-label={label}
    >
      {label}
    </Button>
  );
}
