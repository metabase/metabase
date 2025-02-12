import { skipToken, useGetFieldValuesQuery } from "metabase/api";
import { getFieldOptions } from "metabase/querying/filters/components/FilterValuePicker/utils";
import { Select } from "metabase/ui";
import type { DatasetColumn, FieldId } from "metabase-types/api";

type Props = {
  value: string | null;
  column: DatasetColumn;
  onChange: (newVal: string | null) => void;
  onBlur: () => void;
};

export const ForeignKeyValueSelect = ({
  value,
  column,
  onChange,
  onBlur,
}: Props) => {
  const fieldId = column.field_ref?.[1] as FieldId | null;

  const { data: fieldData, isLoading } = useGetFieldValuesQuery(
    fieldId ?? skipToken,
    // { skip: !canLoadFieldValues(fieldInfo) },
  );

  if (isLoading) {
    return null;
  }

  const preparedData = getFieldOptions(fieldData?.values || []);
  const selectedValue = preparedData ? String(value) : null;

  return (
    <Select
      value={selectedValue}
      data={preparedData ?? []}
      searchable
      initiallyOpened
      autoFocus
      onChange={onChange}
      onBlur={onBlur}
      styles={{
        dropdown: {
          minWidth: 200,
        },
      }}
    />
  );
};
