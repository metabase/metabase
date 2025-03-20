import { useMemo, useState } from "react";
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

import S from "./EditingBodyCellInput.module.css";
import type { EditingBodyPrimitiveProps } from "./types";

type EditingBodyCellCategorySelectProps = EditingBodyPrimitiveProps & {
  withCreateNew?: boolean;
  getDropdownLabelText?: (item: SelectOption) => string;
};

const DefaultItemLabelTextGetter = (item: SelectOption) => item.label;

export const EditingBodyCellCategorySelect = ({
  initialValue,
  datasetColumn,
  withCreateNew = true,
  getDropdownLabelText = DefaultItemLabelTextGetter,
  onSubmit,
  onCancel,
}: EditingBodyCellCategorySelectProps) => {
  const { data: fieldData, isLoading } = useGetFieldValuesQuery(
    datasetColumn.id ?? skipToken,
  );

  const [search, setSearch] = useState("");
  const combobox = useCombobox({
    defaultOpened: true,
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

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      onOptionSubmit={onSubmit}
    >
      <Combobox.Target>
        <Input
          value={(initialValue ?? "").toString()}
          variant="unstyled"
          pointer
          onClick={() => combobox.toggleDropdown()}
          onMouseDown={onCancel}
          className={S.input}
          size="sm"
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
                selected={initialValue === item.value}
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
