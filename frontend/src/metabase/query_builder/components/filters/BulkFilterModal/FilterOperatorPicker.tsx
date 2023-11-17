import { useMemo } from "react";
import { t } from "ttag";
import styled from "@emotion/styled";
import type { SelectProps } from "metabase/ui";
import { Select } from "metabase/ui";
import type { FilterOperatorName } from "metabase-lib";

const InlineSelect = styled(Select)``;

type Option = {
  name: string;
  operator: FilterOperatorName;
};

interface FilterOperatorPickerProps extends Omit<SelectProps, "data"> {
  options: Option[];
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

  return (
    <InlineSelect data={data} {...props} aria-label={t`Filter operator`} />
  );
}
