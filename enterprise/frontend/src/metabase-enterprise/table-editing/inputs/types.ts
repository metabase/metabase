import type { MantineSize, TextInputProps } from "metabase/ui";

export type TableActionInputSharedProps = {
  autoFocus?: boolean;
  initialValue?: string;
  inputProps?: InputProps;
  isNullable?: boolean;
  onChange?: (value: string | null) => unknown;
  onBlur?: (value: string | null) => unknown;
  onEscape?: (value: string | null) => unknown;
  onEnter?: (value: string | null) => unknown;
  onSelect?: (value: string | null) => unknown;
};

type InputProps = {
  size?: MantineSize;
  variant?: TextInputProps["variant"];
  placeholder?: string;
  disabled?: boolean;
  error?: TextInputProps["error"];
  leftSection?: TextInputProps["leftSection"];
  leftSectionPointerEvents?: TextInputProps["leftSectionPointerEvents"];
  rightSection?: TextInputProps["rightSection"];
  rightSectionPointerEvents?: TextInputProps["rightSectionPointerEvents"];
  "data-testid"?: string;
};
