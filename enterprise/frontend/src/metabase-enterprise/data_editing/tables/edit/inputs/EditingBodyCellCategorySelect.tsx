import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

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

import type { EditingBodyPrimitiveProps } from "./types";

type EditingBodyCellCategorySelectProps = EditingBodyPrimitiveProps & {
  withCreateNew?: boolean;
  getDropdownLabelText?: (item: SelectOption) => string;
  getSelectedLabelText?: (item: SelectOption) => string;
};

const DefaultItemLabelTextGetter = (item: SelectOption) => item.label;
const DefaultSelectedLabelTextGetter = (item: SelectOption) => item.value;

export const EditingBodyCellCategorySelect = ({
  autoFocus,
  inputProps,
  initialValue,
  datasetColumn,
  withCreateNew = true,
  classNames,
  getDropdownLabelText = DefaultItemLabelTextGetter,
  getSelectedLabelText = DefaultSelectedLabelTextGetter,
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

  const optionValueSelectOptionMap = useMemo(
    () =>
      fieldData
        ? getFieldOptions(fieldData.values).reduce(
            (map, item) => ({
              ...map,
              [item.value]: item,
            }),
            {} as Record<string, SelectOption>,
          )
        : null,
    [fieldData],
  );

  const inputLabel = useMemo(() => {
    if (isLoading || !optionValueSelectOptionMap) {
      return (
        <Input.Placeholder c="var(--mb-color-text-light)">
          {t`Loading...`}
        </Input.Placeholder>
      );
    }

    if (!value && inputProps?.placeholder) {
      return (
        <Input.Placeholder c="var(--mb-color-text-light)">
          {inputProps.placeholder}
        </Input.Placeholder>
      );
    }

    if (value) {
      // Type safety, should always be present
      if (value in optionValueSelectOptionMap) {
        return getSelectedLabelText(optionValueSelectOptionMap[value]);
      }

      return value;
    }

    return null;
  }, [
    isLoading,
    value,
    optionValueSelectOptionMap,
    inputProps?.placeholder,
    getSelectedLabelText,
  ]);

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <Input
          component="button"
          pointer
          onClick={() => combobox.openDropdown()}
          {...inputProps}
          classNames={{
            wrapper: classNames?.wrapper,
            input: classNames?.selectTextInputElement,
          }}
        >
          {inputLabel}
        </Input>
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
