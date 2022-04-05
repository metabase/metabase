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
import Tooltip from "metabase/components/Tooltip";
import {
  CheckBoxContainer,
  CheckBoxIcon,
  CheckBoxIconContainer,
  CheckBoxInput,
  CheckBoxLabel,
  CheckBoxRoot,
} from "./CheckBox.styled";

const DEFAULT_SIZE = 16;
const DEFAULT_ICON_PADDING = 4;
const DEFAULT_CHECKED_COLOR = "brand";
const DEFAULT_UNCHECKED_COLOR = "text-light";

function isEllipsisActive($span: HTMLSpanElement): boolean {
  return $span.offsetWidth < $span.scrollWidth;
}

interface CheckboxTooltipProps {
  condition: boolean;
  label: ReactNode;
  children: ReactNode;
}

function CheckboxTooltip({
  condition,
  label,
  children,
}: CheckboxTooltipProps): ReactElement {
  return condition ? (
    <Tooltip tooltip={label}>{children}</Tooltip>
  ) : (
    <>{children}</>
  );
}

export interface CheckBoxProps
  extends Omit<HTMLAttributes<HTMLElement>, "onChange" | "onFocus" | "onBlur"> {
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

const CheckBox = forwardRef(function Checkbox(
  {
    label,
    labelEllipsis,
    checked,
    indeterminate,
    disabled,
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
        condition={!!(labelEllipsis && hasLabelEllipsis)}
        label={label}
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
                checked={checked}
                size={size - DEFAULT_ICON_PADDING}
                uncheckedColor={uncheckedColor}
              />
            )}
          </CheckBoxIconContainer>
          {label && (
            <>
              {isValidElement(label) && label}
              {!isValidElement(label) && (
                <CheckBoxLabel
                  labelEllipsis={labelEllipsis || false}
                  ref={labelRef}
                >
                  {label}
                </CheckBoxLabel>
              )}
            </>
          )}
        </CheckBoxContainer>
      </CheckboxTooltip>
    </CheckBoxRoot>
  );
});

export default Object.assign(CheckBox, {
  Label: CheckBoxLabel,
});
