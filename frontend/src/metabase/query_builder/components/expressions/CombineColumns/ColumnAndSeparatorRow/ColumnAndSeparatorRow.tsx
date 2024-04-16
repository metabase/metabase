import { type FocusEvent, useState, useMemo } from "react";
import { t } from "ttag";

import { Button, Flex, Icon, Select, TextInput, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import {
  fromSelectValue,
  toSelectValue,
  label,
  formatSeparator,
  getColumnOptions,
} from "../util";

import styles from "./ColumnAndSeparatorRow.module.css";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata | null;
  index: number;
  columns: Lib.ColumnMetadata[];
  separator: string;
  showRemove: boolean;
  showSeparator: boolean;
  onChange: (
    index: number,
    column: Lib.ColumnMetadata | null,
    separator: string,
  ) => void;
  onRemove: (index: number) => void;
}

export const ColumnAndSeparatorRow = ({
  query,
  stageIndex,
  columns,
  column,
  index,
  separator,
  showRemove,
  showSeparator,
  onChange,
  onRemove,
}: Props) => {
  return (
    <Flex align="flex-end" gap={12} pos="relative">
      <SeparatorInput
        showSeparator={showSeparator}
        value={separator}
        onChange={separator => {
          onChange(index, column, separator);
        }}
      />

      <ColumnInput
        query={query}
        stageIndex={stageIndex}
        columns={columns}
        value={column}
        label={label(index)}
        onChange={column => {
          onChange(index, column, separator);
        }}
      />

      {showRemove && (
        <Button
          classNames={{
            root: styles.remove,
          }}
          aria-label={t`Remove column`}
          leftIcon={<Icon name="close" />}
          variant="default"
          onClick={() => {
            onRemove(index);
          }}
        />
      )}
    </Flex>
  );
};

function SeparatorInput({
  showSeparator,
  value,
  onChange,
}: {
  value: string;
  showSeparator: boolean;
  onChange: (value: string) => void;
}) {
  const [hasFocus, setHasFocus] = useState(false);

  if (!showSeparator) {
    return null;
  }

  function handleFocus(evt: FocusEvent<HTMLInputElement>) {
    setHasFocus(true);
    evt.target.selectionStart = 0;
    evt.target.selectionEnd = evt.target.value.length;
  }

  function handleBlur() {
    setHasFocus(false);
  }

  return (
    <>
      <TextInput
        className={styles.separator}
        label={t`Separator`}
        value={value}
        w={110}
        onChange={event => onChange(event.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {!hasFocus && formatSeparator(value) !== value && (
        <Text color="text-light" className={styles.placeholder}>
          {formatSeparator(value)}
        </Text>
      )}
    </>
  );
}

type ColumnInputProps = {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  label: string;
  value: Lib.ColumnMetadata | null;
  onChange: (column: Lib.ColumnMetadata | null) => void;
};

export function ColumnInput({
  query,
  stageIndex,
  columns,
  label,
  value,
  onChange,
}: ColumnInputProps) {
  const options = useMemo(
    () => getColumnOptions(query, stageIndex, columns),
    [query, stageIndex, columns],
  );

  return (
    <Select
      className={styles.column}
      classNames={{
        wrapper: styles.wrapper,
      }}
      data={options}
      label={label}
      placeholder={t`Select a column`}
      value={toSelectValue(options, value)}
      onChange={value => {
        onChange(fromSelectValue(options, value));
      }}
    />
  );
}
