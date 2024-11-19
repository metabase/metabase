import { match } from "ts-pattern";

import { CopyTextInput } from "metabase/components/CopyTextInput";
import type { TextInputProps } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";

const fontFamilyMonospace = getThemeOverrides().fontFamilyMonospace as string;

export const getTextInputStyles = (params: {
  masked: boolean;
  disabled: boolean;
}) => ({
  label: {
    fontSize: "0.875rem",
    marginBottom: ".5rem",
  },
  input: {
    color: match(params)
      .with({ masked: true }, () => `var(--mb-color-text-light) !important`)
      .with({ disabled: false }, () => `var(--mb-color-text-dark) !important`)
      .otherwise(() => `black !important`),
    fontFamily: fontFamilyMonospace,
  },
});

export const CopyScimInput = ({
  disabled = true,
  ...props
}: TextInputProps & {
  label: string;
  value: string;
  disabled?: boolean;
}) => (
  <CopyTextInput
    readOnly
    disabled={disabled}
    {...props}
    styles={getTextInputStyles({ masked: false, disabled })}
  />
);
