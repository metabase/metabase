import { useState, type FocusEvent } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Flex,
  Icon,
  Text,
  TextInput,
  useMantineTheme,
} from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { ColumnAndSeparator } from "../../types";
import { formatSeparator } from "../../utils";
import { ColumnPicker } from "../ColumnPicker";

import S from "./ColumnAndSeparatorRow.module.css";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  columns: Lib.ColumnMetadata[];
  index: number;
  separator: string;
  showLabels: boolean;
  showRemove: boolean;
  showSeparator: boolean;
  onChange: (index: number, change: Partial<ColumnAndSeparator>) => void;
  onRemove: (index: number) => void;
}

export const ColumnAndSeparatorRow = ({
  query,
  stageIndex,
  column,
  columns,
  index,
  separator,
  showLabels,
  showRemove,
  showSeparator,
  onChange,
  onRemove,
}: Props) => {
  const [isFocused, setIsFocused] = useState(false);
  const { fontFamilyMonospace } = useMantineTheme();

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(true);
    event.target.select();
  }

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
            onFocus={handleFocus}
            styles={{
              input: {
                fontFamily: fontFamilyMonospace as string,
              },
            }}
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
          query={query}
          stageIndex={stageIndex}
          columns={columns}
          label={showLabels ? t`Column` : undefined}
          value={column}
          onChange={column => {
            onChange(index, { column });
          }}
        />
      </Box>

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
