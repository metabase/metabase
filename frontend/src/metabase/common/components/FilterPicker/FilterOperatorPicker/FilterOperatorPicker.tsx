import { useMemo } from "react";
import { t } from "ttag";
import type { SelectProps } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { PickerOperatorOption } from "../types";
import { FlexSelect } from "./FilterOperatorPicker.styled";

interface FilterOperatorPickerProps
  extends Omit<SelectProps, "data" | "withinPortal"> {
  options: PickerOperatorOption<Lib.FilterOperatorName>[];
}

export function FilterOperatorPicker({
  options,
  ...props
}: FilterOperatorPickerProps) {
  const data = useMemo(() => {
    return options.map(option => ({
      label: option.name,
      value: option.operator,
    }));
  }, [options]);

  return <FlexSelect data={data} {...props} aria-label={t`Filter operator`} />;
}
