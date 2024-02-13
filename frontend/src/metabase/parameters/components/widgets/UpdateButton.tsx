import { UpdateButtonStyled } from "metabase/parameters/components/widgets/Widget.styled";
import { getUpdateButtonProps } from "./getUpdateButtonProps";

interface UpdateButtonProps {
  value: unknown;
  unsavedValue: unknown;
  defaultValue: unknown;
  valueRequired: boolean;
  isValid?: boolean;
  onClick?: () => void;
}

export function UpdateButton(props: UpdateButtonProps) {
  const {
    value,
    unsavedValue,
    defaultValue,
    valueRequired,
    isValid,
    onClick = () => {},
  } = props;

  const { label, isDisabled } = getUpdateButtonProps(
    value,
    unsavedValue,
    defaultValue,
    valueRequired,
  );

  return (
    <UpdateButtonStyled disabled={isDisabled || !isValid} onClick={onClick}>
      {label}
    </UpdateButtonStyled>
  );
}
