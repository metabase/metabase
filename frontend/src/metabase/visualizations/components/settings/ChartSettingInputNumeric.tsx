import { type ChangeEvent, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetCardQueryQuery } from "metabase/api";
import { TextInput } from "metabase/ui";
import { isVizSettingColumnReference } from "metabase-types/guards";

import { ChartSettingValuePicker } from "./ChartSettingValuePicker";
import type { ChartSettingWidgetProps } from "./types";

const ALLOWED_CHARS = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  "-",
  "e",
]);

// Note: there are more props than these that are provided by the viz settings
// code, we just don't have types for them here.
interface ChartSettingInputProps extends ChartSettingWidgetProps<number> {
  options?: {
    isInteger?: boolean;
    isNonNegative?: boolean;
  };
  id?: string;
  placeholder?: string;
  getDefault?: () => string;
  columnReferenceConfig: any;
}

export const ChartSettingInputNumeric = ({
  onChange,
  value,
  placeholder,
  options,
  id,
  getDefault,
  columnReferenceConfig,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState<string>(value?.toString() ?? "");
  const defaultValueProps = getDefault ? { defaultValue: getDefault() } : {};

  const { data: referencedCardDataset } = useGetCardQueryQuery(
    isVizSettingColumnReference(value) ? { cardId: value.card_id } : skipToken,
  );

  const displayValue = useMemo(() => {
    if (!value || !isVizSettingColumnReference(value)) {
      return String(inputValue);
    }
    if (!referencedCardDataset) {
      return "";
    }
    const colIndex = referencedCardDataset.data.cols.findIndex(
      col => col.name === value.column_name,
    );
    if (colIndex === -1) {
      return t`Unknown`;
    }
    const col = referencedCardDataset.data.cols[colIndex];
    const val = referencedCardDataset.data.rows[0][colIndex];
    return `${col.display_name} (${val})`;
  }, [value, inputValue, referencedCardDataset]);

  return (
    <TextInput
      id={id}
      {...defaultValueProps}
      placeholder={placeholder}
      type="text"
      error={inputValue && isNaN(Number(inputValue))}
      disabled={isVizSettingColumnReference(value)}
      value={displayValue}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.value.split("").every(ch => ALLOWED_CHARS.has(ch))) {
          setInputValue(e.target.value);
        }
      }}
      onBlur={e => {
        let num = e.target.value !== "" ? Number(e.target.value) : Number.NaN;
        if (options?.isInteger) {
          num = Math.round(num);
        }
        if (options?.isNonNegative && num < 0) {
          num *= -1;
        }

        if (isNaN(num)) {
          onChange(undefined);
        } else {
          onChange(num);
          setInputValue(String(num));
        }
      }}
      rightSection={
        !!columnReferenceConfig && (
          <ChartSettingValuePicker
            value={isVizSettingColumnReference(value) ? value : undefined}
            columnReferenceConfig={columnReferenceConfig}
            onChange={onChange}
          />
        )
      }
    />
  );
};
