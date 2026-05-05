import { useField } from "formik";

import { CurrencyPicker } from "metabase/metadata/components";
import { getFieldCurrency } from "metabase/metadata/utils/field";
import type { FieldFormattingSettings } from "metabase-types/api";

type DatasetFieldMetadataCurrencyPickerProps = {
  onChange: (value: FieldFormattingSettings) => void;
};

export const DatasetFieldMetadataCurrencyPicker = ({
  onChange,
}: DatasetFieldMetadataCurrencyPickerProps) => {
  const [formField, _meta, { setValue }] = useField("settings");
  const { value: settings } = formField;
  const currency = getFieldCurrency(settings);

  const handleChange = (newCurrency: string) => {
    const newSettings = { ...settings, currency: newCurrency };
    setValue(newSettings);
    onChange(newSettings);
  };

  return (
    <CurrencyPicker
      value={currency}
      fw="bold"
      comboboxProps={{
        width: 300,
      }}
      onChange={handleChange}
    />
  );
};
