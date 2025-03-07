import type { CellContext } from "@tanstack/react-table";
import { useState } from "react";

import { BodyCell } from "metabase/data-grid";
import { Box, Combobox, Icon, Input, useCombobox } from "metabase/ui";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import type { RowCellsWithPkValue } from "./types";

interface TableDataViewEditingCellProps
  extends CellContext<RowValues, RowValue> {
  datasetColumn: DatasetColumn;
  datasetColumnIndex: number;
  onCellValueUpdate: (params: RowCellsWithPkValue) => void;
}

export function TableDataViewEditingCell(props: TableDataViewEditingCellProps) {
  const { getValue, row, column } = props;
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <CommonCellEditor
        {...props}
        onSubmit={_value => {
          // onCellValueUpdate({
          //   [datasetColumn.name]: value,
          // });
          setIsEditing(false);
        }}
      />
    );
  } else {
    return (
      // TODO: consider passing `onClick` to `BodyCell` directly (discuss in PR review)
      <Box onClick={() => setIsEditing(true)}>
        <BodyCell
          rowIndex={row.index}
          columnId={column.id}
          value={getValue()}
        />
      </Box>
    );
  }
}

interface CommonCellEditor extends TableDataViewEditingCellProps {
  onSubmit: (value: RowValue) => void;
}

function CommonCellEditor(props: CommonCellEditor) {
  const { datasetColumn } = props;

  switch (datasetColumn.semantic_type) {
    case "type/State":
    case "type/Country":
    case "type/Category":
      return <CategoryCellEditor {...props} />;
    default:
      return <TextCellEditor {...props} />;
  }
}

function TextCellEditor({ getValue, onSubmit }: CommonCellEditor) {
  const [value, setValue] = useState(getValue());

  return (
    <Input
      value={value?.toString()}
      variant="unstyled"
      size="xs"
      autoFocus
      onBlur={() => onSubmit(value)}
      onChange={event => setValue(event.target.value)}
      style={{ border: "2px solid blue" }}
    />
  );
}

function CategoryCellEditor(props: CommonCellEditor) {
  const groceries = [
    "🍎 Apples",
    "🍌 Bananas",
    "🥦 Broccoli",
    "🥕 Carrots",
    "🍫 Chocolate",
  ];

  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const combobox = useCombobox({
    defaultOpened: true,

    onDropdownClose: () => {
      props.onSubmit(selectedItem);
    },

    onDropdownOpen: () => {
      combobox.focusSearchInput();
    },
  });

  const options = groceries
    .filter(item => item.toLowerCase().includes(search.toLowerCase().trim()))
    .map(item => (
      <Combobox.Option value={item} key={item}>
        {item}
      </Combobox.Option>
    ));

  return (
    <>
      <Combobox
        store={combobox}
        width={250}
        position="bottom-start"
        withArrow
        onOptionSubmit={val => {
          setSelectedItem(val);
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target withAriaAttributes={false}>
          <Box
            onClick={() => combobox.toggleDropdown()}
            style={{ border: "2px solid blue" }}
          >
            <BodyCell
              rowIndex={props.row.index}
              columnId={props.column.id}
              value={props.getValue()}
            />
          </Box>
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Search
            value={search}
            onChange={event => setSearch(event.currentTarget.value)}
            placeholder="Search the list"
            leftSection={<Icon name="search" />}
            // pos="sticky"
            // top={0}
          />
          <Combobox.Options>
            {options.length > 0 ? (
              options
            ) : (
              <Combobox.Empty>Nothing found</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </>
  );
}
