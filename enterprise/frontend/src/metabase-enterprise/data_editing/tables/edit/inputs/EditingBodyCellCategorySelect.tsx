import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { useSearchFieldValuesQuery } from "metabase/api";
import { getFieldOptions } from "metabase/querying/filters/components/FilterValuePicker/utils";
import {
  Box,
  Combobox,
  Icon,
  Input,
  Loader,
  type SelectOption,
  TextInput,
  useCombobox,
} from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import type { EditingBodyPrimitiveProps } from "./types";

type EditingBodyCellCategorySelectProps = EditingBodyPrimitiveProps & {
  withCreateNew?: boolean;
  getDropdownLabelText?: (item: SelectOption) => string;
  getSelectedLabelText?: (item: SelectOption) => string;
};

const DefaultItemLabelTextGetter = (item: SelectOption) => item.label;
const DefaultSelectedLabelTextGetter = (item: SelectOption) => item.value;

const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_DEBOUNCE = 500;

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
  const [value, setValue] = useState(initialValue?.toString() ?? "");
  const [search, setSearch] = useState("");
  const combobox = useCombobox({
    defaultOpened: autoFocus,
    onDropdownClose: onCancel,
  });

  // `searchToFetch` is detached from `search` for two reasons:
  // - to be debounced to avoid requests on every keystroke
  // - to perform local filtering if the full list is less then `SEARCH_LIMIT_DEFAULT`
  const [searchToFetch, setSearchToFetch] = useState("");
  const [initialFieldValues, setInitialFieldValues] = useState<
    FieldValue[] | undefined
  >(undefined);

  const shouldPerformLocalSearch =
    initialFieldValues && initialFieldValues.length < SEARCH_LIMIT_DEFAULT;

  useDebounce(
    () => {
      if (!shouldPerformLocalSearch) {
        setSearchToFetch(search);
      }
    },
    SEARCH_DEBOUNCE,
    [search, shouldPerformLocalSearch],
  );

  const {
    data: fieldValues,
    isLoading,
    isFetching,
  } = useSearchFieldValuesQuery(
    {
      fieldId: datasetColumn.id ?? -1,
      searchFieldId:
        datasetColumn.remapped_to_column?.id ?? datasetColumn.id ?? -1,
      value: searchToFetch || undefined,
      limit: SEARCH_LIMIT_DEFAULT,
    },
    { skip: datasetColumn.id === undefined },
  );

  useEffect(() => {
    if (!initialFieldValues && fieldValues) {
      setInitialFieldValues(fieldValues);
    }
  }, [initialFieldValues, fieldValues]);

  const options = useMemo(() => {
    if (fieldValues) {
      const options = getFieldOptions(fieldValues);

      if (shouldPerformLocalSearch) {
        return options.filter((item) =>
          getDropdownLabelText(item)
            .toLowerCase()
            .includes(search.toLowerCase().trim()),
        );
      }

      return options;
    }

    return [];
  }, [shouldPerformLocalSearch, fieldValues, search, getDropdownLabelText]);

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
      fieldValues
        ? getFieldOptions(fieldValues).reduce(
            (map, item) => ({
              ...map,
              [item.value]: item,
            }),
            {} as Record<string, SelectOption>,
          )
        : null,
    [fieldValues],
  );

  const inputLabel = useMemo(() => {
    if (isLoading || !optionValueSelectOptionMap) {
      return (
        <Input.Placeholder c="text-light">{t`Loading...`}</Input.Placeholder>
      );
    }

    if (!value && inputProps?.placeholder) {
      return (
        <Input.Placeholder c="text-light">
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
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={t`Search the list`}
            leftSection={<Icon name="search" />}
            rightSection={isFetching ? <Loader size="xs" /> : undefined}
            autoFocus
          />
        </Box>

        <Combobox.Options p="0.5rem">
          {options.length > 0 ? (
            options.map((item) => (
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
