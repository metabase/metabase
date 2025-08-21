import { useState } from "react";
import { jt } from "ttag";
import _ from "underscore";

import { FormSelect, type FormSelectProps } from "metabase/forms";
import { SelectItem, Text } from "metabase/ui";

export function SchemaFormSelect(props: FormSelectProps & { data: string[] }) {
  const { data, ...rest } = props;
  const [searchValue, setSearchValue] = useState("");

  const dataWithNewItem = _.uniq([...data, searchValue]);

  return (
    <FormSelect
      {...rest}
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
