import type { FocusEvent } from "react";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";

type LimitedVisibilityType = "visible" | "hidden";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: LimitedVisibilityType | null;
  onChange: (value: LimitedVisibilityType | null) => void;
}

export const VisibilityInput = ({
  comboboxProps,
  value,
  onChange,
  onFocus,
  ...props
}: Props) => {
  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
    onFocus?.(event);
  };

  return (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={[
        { value: "visible", label: t`Visible` },
        { value: "hidden", label: t`Hidden` },
      ]}
      label={t`Visibility`}
      placeholder={t`Select visibility`}
      value={value}
      onChange={onChange}
      onFocus={handleFocus}
      {...props}
    />
  );
};
