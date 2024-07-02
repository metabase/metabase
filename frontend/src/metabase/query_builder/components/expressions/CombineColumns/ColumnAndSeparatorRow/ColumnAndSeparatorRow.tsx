import type { FocusEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { Button, Icon, Flex, TextInput, Text, rem } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";
import type * as Lib from "metabase-lib";

import { label, formatSeparator } from "../util";

import styles from "./ColumnAndSeparatorRow.module.css";
import { ColumnInput } from "./ColumnInput";

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
          styles={{
            root: {
              border: "none",
            },
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

const { fontFamilyMonospace } = getThemeOverrides();

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

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    setHasFocus(true);
    event.target.select();
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    if (event.target === document.activeElement) {
      // avoid losing focus when the user switches to another window
      // but leaves the focus on the element.
      return;
    }

    setHasFocus(false);
  }

  return (
    <>
      <TextInput
        className={styles.separator}
        label={t`Separator`}
        value={value}
        w={rem(110)}
        onChange={event => onChange(event.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        styles={{
          input: {
            fontFamily: fontFamilyMonospace as string,
          },
        }}
      />
      {!hasFocus && formatSeparator(value) !== value && (
        <Text color="text-light" className={styles.placeholder}>
          {formatSeparator(value)}
        </Text>
      )}
    </>
  );
}
