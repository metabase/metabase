import { useField } from "formik";
import { useState } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import { FormSelect, type FormSelectProps } from "metabase/forms";
import { SelectItem, Stack, Text } from "metabase/ui";

export function SchemaFormSelect(props: FormSelectProps & { data: string[] }) {
  const { data, name, ...rest } = props;
  const [{ value }] = useField<string | null>(name);

  const [searchValue, setSearchValue] = useState(value ?? "");
  const dataWithNewItem = _.uniq([
    ...data,
    ...(searchValue !== "" ? [searchValue] : []),
  ]);

  const isNewValue = value !== "" && !data.includes(value ?? "");

  return (
    <Stack gap="sm">
      <FormSelect
        {...rest}
        name={name}
        data={dataWithNewItem}
        searchable
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        renderOption={({ option }) => {
          const { value } = option;
          if (data.includes(value)) {
            return <ExistingSelectItem value={value} />;
          }
          return <NewSelectItem value={value} />;
        }}
      />
      {isNewValue && (
        <Text size="sm" c="text-secondary">
          {t`This schema will be created the first time the transform runs.`}
        </Text>
      )}
    </Stack>
  );
}

function ExistingSelectItem({ value }: { value: string }) {
  return <SelectItem>{value}</SelectItem>;
}

function NewSelectItem({ value }: { value: string }) {
  return (
    <SelectItem>
      <Text c="inherit" lh="inherit">
        {jt`Create new schema ${(<strong key="value">{value}</strong>)}`}
      </Text>
    </SelectItem>
  );
}
