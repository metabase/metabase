import { t } from "ttag";

import { Button, Flex, Icon, Select, TextInput, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { ColumnOption } from "../util";
import {
  fromSelectValue,
  toSelectValue,
  label,
  formatSeparator,
} from "../util";

import styles from "./ColumnAndSeparatorRow.module.css";

interface Props {
  column: Lib.ColumnMetadata | null;
  index: number;
  options: ColumnOption[];
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
  column,
  index,
  options,
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
      <Select
        className={styles.column}
        classNames={{
          wrapper: styles.wrapper,
        }}
        data={options}
        label={label(index)}
        placeholder={t`Select a column`}
        value={toSelectValue(options, column)}
        onChange={value => {
          const column = fromSelectValue(options, value);
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
  if (!showSeparator) {
    return null;
  }

  return (
    <>
      <TextInput
        className={styles.separator}
        label={t`Separator`}
        placeholder={value === "" ? "  (empty)" : t`Separator`}
        value={value}
        w={110}
        onChange={event => onChange(event.target.value)}
      />
      {value && formatSeparator(value) !== value && (
        <Text color="text-light" className={styles.placeholder}>
          {formatSeparator(value)}
        </Text>
      )}
    </>
  );
}
