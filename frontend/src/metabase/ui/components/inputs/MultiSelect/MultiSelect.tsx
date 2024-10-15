import {
  MultiSelect as MantineMultiSelect,
  type MultiSelectProps as MantineMultiSelectProps,
} from "@mantine/core";

import { type LegacyComboboxData, normalizeComboboxData } from "metabase/ui";

export interface MultiSelectProps
  extends Omit<MantineMultiSelectProps, "data"> {
  data: LegacyComboboxData;
}

/** A version of MultiSelect that can receive Mantine-v6-style props */
export const MultiSelect = ({
  data: legacyMultiSelectData,
  ...props
}: MultiSelectProps) => {
  const data: MantineMultiSelectProps["data"] = normalizeComboboxData(
    legacyMultiSelectData,
  );
  return <MantineMultiSelect {...props} data={data} />;
};
