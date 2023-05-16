import React, {
  ChangeEvent,
  FocusEvent,
  forwardRef,
  HTMLAttributes,
  isValidElement,
  ReactElement,
  ReactNode,
  Ref,
  useRef,
} from "react";
import Tooltip from "metabase/core/components/Tooltip";
import {
  DEFAULT_CHECKED_COLOR,
  DEFAULT_ICON_PADDING,
  DEFAULT_SIZE,
  DEFAULT_UNCHECKED_COLOR,
} from "./constants";
import { isEllipsisActive } from "./utils";
import {
  CheckBoxContainer,
  CheckBoxIcon,
  CheckBoxIconContainer,
  CheckBoxInput,
  CheckBoxLabel,
  CheckBoxRoot,
} from "./CheckBox.styled";

export interface CheckBoxProps
  extends Omit<HTMLAttributes<HTMLElement>, "onChange" | "onFocus" | "onBlur"> {
  name?: string;
  label?: ReactNode;
  labelEllipsis?: boolean;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  size?: number;
  checkedColor?: string;
  uncheckedColor?: string;
  autoFocus?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

interface CheckboxTooltipProps {
  hasTooltip: boolean;
  tooltipLabel: ReactNode;
  children: ReactNode;
}

const CheckBox = forwardRef<HTMLLabelElement, CheckBoxProps>(function Checkbox(
  {
    name,
    id,
    label,
    labelEllipsis = false,
    checked,
    indeterminate,
    disabled = false,
    size = DEFAULT_SIZE,
    checkedColor = DEFAULT_CHECKED_COLOR,
    uncheckedColor = DEFAULT_UNCHECKED_COLOR,
    autoFocus,
    onClick,
    onChange,
    onFocus,
    onBlur,
    ...props
  }: CheckBoxProps,
  ref: Ref<HTMLLabelElement>,
): JSX.Element {
  const isControlledCheckBoxInput = !!onChange;
  const labelRef = useRef<HTMLSpanElement>(null);
  const hasLabelEllipsis =
    labelRef.current && isEllipsisActive(labelRef.current);

  return (
    <CheckBoxRoot ref={ref} {...props}>
      <CheckboxTooltip
        hasTooltip={!!(labelEllipsis && hasLabelEllipsis)}
        tooltipLabel={label}
      >
        <CheckBoxInput
          id={id ?? name}
          name={name}
          type="checkbox"
          checked={isControlledCheckBoxInput ? !!checked : undefined}
          defaultChecked={isControlledCheckBoxInput ? undefined : !!checked}
          size={size}
          disabled={disabled}
          autoFocus={autoFocus}
          onClick={onClick}
          onChange={isControlledCheckBoxInput ? onChange : undefined}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <CheckBoxContainer disabled={disabled}>
          <CheckBoxIconContainer
            checked={checked}
            size={size}
            checkedColor={checkedColor}
            uncheckedColor={uncheckedColor}
          >
            {(checked || indeterminate) && (
              <CheckBoxIcon
                name={indeterminate ? "dash" : "check"}
                checked={!!checked}
                size={size - DEFAULT_ICON_PADDING}
                uncheckedColor={uncheckedColor}
              />
            )}
          </CheckBoxIconContainer>
          {label &&
            (isValidElement(label) ? (
              label
            ) : (
              <CheckBoxLabel labelEllipsis={labelEllipsis} ref={labelRef}>
                {label}
              </CheckBoxLabel>
            ))}
        </CheckBoxContainer>
      </CheckboxTooltip>
    </CheckBoxRoot>
  );
});

function CheckboxTooltip({
  hasTooltip,
  tooltipLabel,
  children,
}: CheckboxTooltipProps): ReactElement {
  return hasTooltip ? (
    <Tooltip tooltip={tooltipLabel}>{children}</Tooltip>
  ) : (
    <>{children}</>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(CheckBox, {
  Label: CheckBoxLabel,
});
