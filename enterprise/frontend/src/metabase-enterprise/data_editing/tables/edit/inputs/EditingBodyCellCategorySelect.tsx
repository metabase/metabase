import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import { skipToken, useGetFieldValuesQuery } from "metabase/api";
import { getFieldOptions } from "metabase/querying/filters/components/FilterValuePicker/utils";
import {
  Box,
  Combobox,
  Icon,
  Input,
  type SelectOption,
  TextInput,
  useCombobox,
} from "metabase/ui";

import S from "./EditingBodyCellCategorySelect.module.css";
import type { EditingBodyPrimitiveProps } from "./types";

type EditingBodyCellCategorySelectProps = EditingBodyPrimitiveProps & {
  withCreateNew?: boolean;
  getDropdownLabelText?: (item: SelectOption) => string;
};

const DefaultItemLabelTextGetter = (item: SelectOption) => item.label;

export const EditingBodyCellCategorySelect = ({
  autoFocus,
  inputProps,
  initialValue,
  datasetColumn,
  withCreateNew = true,
  classNames,
  getDropdownLabelText = DefaultItemLabelTextGetter,
  onSubmit,
  onChangeValue,
  onCancel,
}: EditingBodyCellCategorySelectProps) => {
  const { data: fieldData, isLoading } = useGetFieldValuesQuery(
    datasetColumn.id ?? skipToken,
  );

  const [value, setValue] = useState(initialValue?.toString() ?? "");
  const [search, setSearch] = useState("");
  const combobox = useCombobox({
    defaultOpened: autoFocus,
    onDropdownClose: onCancel,
  });

  const options = useMemo(
    () =>
      fieldData
        ? getFieldOptions(fieldData.values).filter(item =>
            getDropdownLabelText(item)
              .toLowerCase()
              .includes(search.toLowerCase().trim()),
          )
        : [],
    [fieldData, getDropdownLabelText, search],
  );

  const handleOptionSubmit = useCallback(
    (value: string) => {
      setValue(value);
      onSubmit(value);
      onChangeValue?.(value);
      combobox.toggleDropdown();
    },
    [onSubmit, setValue, onChangeValue, combobox],
  );

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <Input
          value={value}
          pointer
          onClick={() => combobox.openDropdown()}
          {...inputProps}
          classNames={{
            wrapper: classNames?.wrapper,
            input: cx(S.fakeInput, classNames?.selectTextInputElement),
          }}
          // Disable input editing when the dropdown is open (UX)
          onChange={noop}
        />
      </Combobox.Target>

      <Combobox.Dropdown mah="none" miw={250}>
        <Box p="0.5rem" pb="0" bg="white" pos="sticky" top={0}>
          <TextInput
            value={search}
            onChange={event => setSearch(event.currentTarget.value)}
            placeholder={t`Search the list`}
            leftSection={<Icon name="search" />}
            autoFocus
          />
        </Box>

        <Combobox.Options p="0.5rem">
          {options.length > 0 ? (
            options.map(item => (
              <Combobox.Option
                selected={value === item.value}
                value={item.value}
                key={item.value}
              >
                {getDropdownLabelText(item)}
              </Combobox.Option>
            ))
          ) : isLoading ? (
            <Combobox.Empty>{t`Loading values...`}</Combobox.Empty>
          ) : withCreateNew ? (
            <Combobox.Option value={search}>
              {t`Add option:`} <strong>{search}</strong>
            </Combobox.Option>
          ) : (
            <Combobox.Empty>{t`Nothing found`}</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};
