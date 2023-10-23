import { useMemo } from "react";
import { t } from "ttag";
import type { SelectProps } from "metabase/ui";
import { Select } from "metabase/ui";
import type { FilterOperatorName } from "metabase-lib";
import type { PickerOperatorOption } from "./types";

interface FilterOperatorPickerProps
  extends Omit<SelectProps, "data" | "withinPortal"> {
  options: PickerOperatorOption<FilterOperatorName>[];
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

  return <Select data={data} {...props} aria-label={t`Filter operator`} />;
}
