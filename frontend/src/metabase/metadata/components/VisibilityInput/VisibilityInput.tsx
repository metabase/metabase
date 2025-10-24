import type { FocusEvent } from "react";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import type { TableVisibilityType } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: TableVisibilityType | undefined;
  onChange: (value: TableVisibilityType) => void;
}

type LimitedVisibilityType = "visible" | "hidden";

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

  const limitedValue =
    typeof value === "undefined"
      ? undefined
      : value === null
        ? "visible"
        : "hidden";

  return (
    <Select<LimitedVisibilityType>
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
      value={limitedValue}
      onChange={(value) => onChange(value === "visible" ? null : "hidden")}
      onFocus={handleFocus}
      {...props}
    />
  );
};
