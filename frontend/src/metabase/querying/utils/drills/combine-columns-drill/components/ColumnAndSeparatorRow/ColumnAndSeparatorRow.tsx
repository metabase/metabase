import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Icon, Select, Text, TextInput } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { ColumnAndSeparator, ColumnOption } from "../../types";
import { formatSeparator, fromSelectValue, toSelectValue } from "../../utils";
import { ColumnPicker } from "../ColumnPicker";

import S from "./ColumnAndSeparatorRow.module.css";

interface Props {
  column: Lib.ColumnMetadata;
  index: number;
  options: ColumnOption[];
  separator: string;
  showLabels: boolean;
  showRemove: boolean;
  showSeparator: boolean;
  onChange: (index: number, change: Partial<ColumnAndSeparator>) => void;
  onRemove: (index: number) => void;
}

export const ColumnAndSeparatorRow = ({
  column,
  index,
  options,
  separator,
  showLabels,
  showRemove,
  showSeparator,
  onChange,
  onRemove,
}: Props) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Flex align="flex-end" gap={12}>
      {showSeparator && (
        <Box pos="relative">
          <TextInput
            className={S.separator}
            label={showLabels ? t`Separator` : undefined}
            placeholder={formatSeparator("")}
            value={separator}
            w={110}
            onChange={event => {
              const separator = event.target.value;
              onChange(index, { separator });
            }}
            onBlur={() => setIsFocused(false)}
            onFocus={() => setIsFocused(true)}
          />

          {separator === " " && !isFocused && (
            <Text
              bottom={8} // using bottom instead of top because the input does not always have a label
              className={S.whitespacePlaceholder}
              color="text-light"
              left={1} // account for TextInput border
              pos="absolute"
              px="0.6875rem" // same as TextInput
              size="md"
              unselectable="on"
            >
              {formatSeparator(separator)}
            </Text>
          )}
        </Box>
      )}

      <Box className={S.column}>
        <ColumnPicker
          label={showLabels ? t`Column` : undefined}
          options={options}
          value={toSelectValue(options, column)}
          onChange={value => {
            const column = fromSelectValue(options, value);
            onChange(index, { column });
          }}
        />
      </Box>

      {/* <Select
        className={S.column}
        data={options}
        label={showLabels ? t`Column` : undefined}
        placeholder={t`Column`}
        value={toSelectValue(options, column)}
        onChange={value => {
          const column = fromSelectValue(options, value);
          onChange(index, { column });
        }}
      /> */}

      {showRemove && (
        <Button
          classNames={{
            root: S.remove,
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
