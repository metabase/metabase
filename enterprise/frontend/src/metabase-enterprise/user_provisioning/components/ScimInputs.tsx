import { CopyTextInput } from "metabase/components/CopyTextInput";
import { getThemeOverrides } from "metabase/ui/theme";

const fontFamilyMonospace = getThemeOverrides().fontFamilyMonospace as string;

export const textInputStyles = {
  input: {
    color: `black !important`,
    fontFamily: fontFamilyMonospace,
  },
};

export const CopyScimInput = ({
  label,
  value,
  disabled = true,
}: {
  label: string;
  value: string;
  disabled?: boolean;
}) => (
  <CopyTextInput
    label={label}
    value={value}
    readOnly
    disabled={disabled}
    styles={textInputStyles}
  />
);
