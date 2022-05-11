import React, {
  forwardRef,
  isValidElement,
  ReactElement,
  Ref,
  useRef,
} from "react";
import Tooltip from "metabase/components/Tooltip";
import {
  CheckBoxContainer,
  CheckBoxIcon,
  CheckBoxIconContainer,
  CheckBoxInput,
  CheckBoxLabel,
  CheckBoxRoot,
} from "./CheckBox.styled";
import { CheckBoxProps, CheckboxTooltipProps } from "./types";
import { isEllipsisActive } from "./utils";
import {
  DEFAULT_CHECKED_COLOR,
  DEFAULT_ICON_PADDING,
  DEFAULT_SIZE,
  DEFAULT_UNCHECKED_COLOR,
} from "./constants";

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

const CheckBox = forwardRef<HTMLLabelElement, CheckBoxProps>(function Checkbox(
  {
    name,
    label,
    labelEllipsis = false,
    checked,
    indeterminate,
    disabled = false,
    size = DEFAULT_SIZE,
    checkedColor = DEFAULT_CHECKED_COLOR,
    uncheckedColor = DEFAULT_UNCHECKED_COLOR,
    autoFocus,
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
          type="checkbox"
          checked={isControlledCheckBoxInput ? !!checked : undefined}
          defaultChecked={isControlledCheckBoxInput ? undefined : !!checked}
          size={size}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={isControlledCheckBoxInput ? onChange : undefined}
          onFocus={onFocus}
          onBlur={onBlur}
          id={name}
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

export default Object.assign(CheckBox, {
  Label: CheckBoxLabel,
});
