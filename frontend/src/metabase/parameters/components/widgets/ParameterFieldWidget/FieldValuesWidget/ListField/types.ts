import type { JSX } from "react";

import type { FieldValue, RowValue } from "metabase-types/api";
export type Option = FieldValue;

export const getOptionDisplayName = (option: Option | RowValue[]) =>
  String(option.at(-1));

export interface ListFieldProps {
  onChange: (value: RowValue[]) => void;
  value: RowValue[];
  options: Option[];
  optionRenderer: (option: Option) => JSX.Element;
  placeholder: string;
  isDashboardFilter?: boolean;
  checkedColor?: string;
  isLoading?: boolean;
}
