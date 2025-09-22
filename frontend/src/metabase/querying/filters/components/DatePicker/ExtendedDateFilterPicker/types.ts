import type { SpecificDatePickerValue } from "metabase/querying/filters/types";

export interface QuarterOption {
  label: string;
  value: string;
  startDate: Date;
  endDate: Date;
  months: Date[];
}

export interface YearOption {
  label: string;
  value: number;
}

export interface QuarterOnlyOption {
  label: string;
  value: number;
}

export interface ExtendedDateFilterPickerProps {
  value?: SpecificDatePickerValue;
  onChange: (value: SpecificDatePickerValue) => void;
  onApply?: (value: SpecificDatePickerValue) => void;
  onBack?: () => void;
  readOnly?: boolean;
}
