import React, {
  forwardRef,
  InputHTMLAttributes,
  MouseEvent,
  ReactNode,
  Ref,
} from "react";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import {
  InputField,
  InputLeftButton,
  InputRightButton,
  InputRoot,
} from "./Input.styled";
import { InputSize } from "./types";

export type InputAttributes = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
>;

export interface InputProps extends InputAttributes {
  inputRef?: Ref<HTMLInputElement>;
  size?: InputSize;
  error?: boolean;
  fullWidth?: boolean;
  leftIcon?: string;
  leftIconTooltip?: ReactNode;
  rightIcon?: string;
  rightIconTooltip?: ReactNode;
  onLeftIconClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onRightIconClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

const Input = forwardRef(function Input(
  {
    className,
    style,
    inputRef,
    size = "medium",
    error,
    fullWidth,
    leftIcon,
    leftIconTooltip,
    rightIcon,
    rightIconTooltip,
    onLeftIconClick,
    onRightIconClick,
    ...props
  }: InputProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <InputRoot
      ref={ref}
      className={className}
      style={style}
      fullWidth={fullWidth}
    >
      <InputField
        {...props}
        ref={inputRef}
        fieldSize={size}
        hasError={error}
        fullWidth={fullWidth}
        hasRightIcon={Boolean(rightIcon)}
      />
      {leftIcon && (
        <Tooltip tooltip={leftIconTooltip} placement="left" offset={[0, 24]}>
          <InputLeftButton tabIndex={-1} onClick={onLeftIconClick}>
            <Icon name={leftIcon} />
          </InputLeftButton>
        </Tooltip>
      )}
      {rightIcon && (
        <Tooltip tooltip={rightIconTooltip} placement="right" offset={[0, 24]}>
          <InputRightButton tabIndex={-1} onClick={onRightIconClick}>
            <Icon name={rightIcon} />
          </InputRightButton>
        </Tooltip>
      )}
    </InputRoot>
  );
});

export default Object.assign(Input, {
  Root: InputRoot,
  Field: InputField,
});
