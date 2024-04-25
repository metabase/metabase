import type {
  ChangeEvent,
  FocusEvent,
  HTMLAttributes,
  ReactElement,
  ReactNode,
  Ref,
} from "react";
import { forwardRef, isValidElement, useRef } from "react";

import Tooltip from "metabase/core/components/Tooltip";

import {
  CheckBoxContainer,
  CheckBoxIcon,
  CheckBoxIconContainer,
  CheckBoxInput,
  CheckBoxLabel,
  CheckBoxRoot,
} from "./CheckBox.styled";
import {
  DEFAULT_CHECKED_COLOR,
  DEFAULT_ICON_PADDING,
  DEFAULT_SIZE,
  DEFAULT_UNCHECKED_COLOR,
} from "./constants";
import { isEllipsisActive } from "./utils";

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

const BaseCheckBox = forwardRef<HTMLLabelElement, CheckBoxProps>(
  function Checkbox(
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
  },
);

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

/**
 * @deprecated: use Checkbox from "metabase/ui"
 */
const Checkbox = Object.assign(BaseCheckBox, {
  Label: CheckBoxLabel,
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Checkbox;
