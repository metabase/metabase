import type { MantineSize, TextInputProps } from "metabase/ui";

export type ActionInputInputProps = {
  size?: MantineSize;
  variant?: TextInputProps["variant"];
  placeholder?: string;
  disabled?: boolean;
  error?: TextInputProps["error"];
  rightSection?: TextInputProps["rightSection"];
  rightSectionPointerEvents?: TextInputProps["rightSectionPointerEvents"];
};

export type ActionInputSharedProps = {
  autoFocus?: boolean;
  initialValue?: string;
  inputProps?: ActionInputInputProps;
  isNullable?: boolean;
  onChange?: (value: string | null) => unknown;
  onBlur?: (value: string | null) => unknown;
  onEscape?: (value: string | null) => unknown;
  onEnter?: (value: string | null) => unknown;
};
