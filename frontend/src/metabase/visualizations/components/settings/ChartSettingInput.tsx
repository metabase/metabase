import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetCardQueryQuery } from "metabase/api";
import { TextInput } from "metabase/ui";
import { isVizSettingColumnReference } from "metabase-types/guards";

import { ChartSettingValuePicker } from "./ChartSettingValuePicker";

interface ChartSettingInputProps {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  id?: string;
  columnReferenceConfig: any;
}

export const ChartSettingInput = ({
  value,
  onChange,
  placeholder,
  id,
  columnReferenceConfig,
}: ChartSettingInputProps) => {
  const [inputValue, setInputValue] = useState(value);

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
      data-testid={id}
      placeholder={placeholder}
      disabled={isVizSettingColumnReference(value)}
      value={displayValue}
      onChange={e => setInputValue(e.target.value)}
      onBlur={() => {
        if (inputValue !== (value || "")) {
          onChange(inputValue);
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
