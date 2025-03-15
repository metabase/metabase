import type { CellContext } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetFieldValuesQuery } from "metabase/api";
import { getFieldOptions } from "metabase/querying/filters/components/FilterValuePicker/utils";
import {
  Box,
  Combobox,
  Icon,
  Input,
  TextInput,
  useCombobox,
} from "metabase/ui";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import S from "./EditingBodyCell.module.css";
import type { UpdatedRowCellsHandlerParams } from "./types";

interface EditingBodyCellProps<TRow, TValue> {
  column: DatasetColumn;
  cellContext: CellContext<TRow, TValue>;
  onCellValueUpdate: (params: UpdatedRowCellsHandlerParams) => void;
  onCellEditCancel: () => void;
}

export const EditingBodyCellConditional = (
  props: EditingBodyCellProps<RowValues, RowValue>,
) => {
  const {
    onCellEditCancel,
    onCellValueUpdate,
    column,
    cellContext: {
      getValue,
      column: { id: columnName },
      row: { index: rowIndex },
    },
  } = props;

  const initialValue = getValue<RowValue>();

  const doCellValueUpdate = useCallback(
    (value: RowValue) => {
      if (value !== initialValue) {
        onCellValueUpdate({
          data: { [columnName]: value },
          rowIndex,
        });
      }

      // Hide the editing cell after submitting the value
      onCellEditCancel();
    },
    [columnName, onCellEditCancel, onCellValueUpdate, rowIndex, initialValue],
  );

  switch (column?.semantic_type) {
    case "type/State":
    case "type/Country":
    case "type/Category":
      return (
        <EditingBodyCellSelect
          initialValue={initialValue}
          datasetColumn={column}
          onSubmit={doCellValueUpdate}
          onCancel={onCellEditCancel}
        />
      );

    default:
      return (
        <EditingBodyCellText
          initialValue={initialValue}
          datasetColumn={column}
          onSubmit={doCellValueUpdate}
          onCancel={onCellEditCancel}
        />
      );
  }
};

interface EditingBodyPrimitiveProps {
  datasetColumn: DatasetColumn;
  initialValue: RowValue;
  onSubmit: (value: RowValue) => unknown;
  onCancel: () => unknown;
}

export const EditingBodyCellText = ({
  initialValue,
  onSubmit,
  onCancel,
}: EditingBodyPrimitiveProps) => {
  return (
    <Input
      defaultValue={(initialValue ?? "").toString()}
      className={S.input}
      variant="unstyled"
      size="xs"
      autoFocus
      onKeyUp={event => {
        if (event.key === "Escape") {
          onCancel();
        } else if (event.key === "Enter") {
          onSubmit(event.currentTarget.value);
        }
      }}
      onBlur={event => {
        onSubmit(event.currentTarget.value);
      }}
    />
  );
};

export const EditingBodyCellSelect = ({
  initialValue,
  datasetColumn,
  onSubmit,
  onCancel,
}: EditingBodyPrimitiveProps) => {
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
            item.label.toLowerCase().includes(search.toLowerCase().trim()),
          )
        : [],
    [fieldData, search],
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
          size="xs"
        />
      </Combobox.Target>

      <Combobox.Dropdown mah="none" miw={250}>
        <Box p="0.5rem" pb="0 " bg="white" pos="sticky" top={0}>
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
                {item.label}
              </Combobox.Option>
            ))
          ) : isLoading ? (
            <Combobox.Empty>{t`Loading values...`}</Combobox.Empty>
          ) : (
            <Combobox.Option value={search}>
              {t`Add option:`} <strong>{search}</strong>
            </Combobox.Option>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
};
