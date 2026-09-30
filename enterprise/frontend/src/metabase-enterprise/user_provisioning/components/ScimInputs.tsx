import { match } from "ts-pattern";

import type { CopyTextInputProps } from "metabase/common/components/CopyTextInput";
import { CopyTextInput } from "metabase/common/components/CopyTextInput";

// why are we overriding the default styles?
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
      .with(
        { disabled: false },
        () => `var(--mb-color-text-primary) !important`,
      )
      .otherwise(() => `var(--mb-color-text-primary) !important`),
    fontFamily: "var(--mb-default-monospace-font-family)",
  },
});

export const CopyScimInput = ({
  disabled = true,
  ...props
}: CopyTextInputProps & {
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
