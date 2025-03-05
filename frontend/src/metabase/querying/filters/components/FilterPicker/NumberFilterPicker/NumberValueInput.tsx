import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import type { NumberOrEmptyValue } from "metabase/querying/filters/hooks/use-number-filter";
import { Box, Flex, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { NumberFilterValuePicker } from "../../FilterValuePicker";
import { NumberFilterInput } from "../../NumberFilterInput";

interface NumberValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberOrEmptyValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberOrEmptyValue[]) => void;
}

export function NumberValueInput({
  query,
  stageIndex,
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: NumberValueInputProps) {
  if (hasMultipleValues) {
    return (
      <Box p="md" mah="25vh" style={{ overflow: "auto" }}>
        <NumberFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values.filter(isNotNull)}
          autoFocus
          onChange={onChange}
        />
      </Box>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <NumberFilterInput
          value={values[0]}
          placeholder={t`Enter a number`}
          autoFocus
          w="100%"
          aria-label={t`Filter value`}
          onChange={newValue => onChange([newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center" justify="center" p="md">
        <NumberFilterInput
          value={values[0]}
          placeholder={t`Min`}
          autoFocus
          onChange={newValue => onChange([newValue, values[1]])}
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberFilterInput
          value={values[1]}
          placeholder={t`Max`}
          onChange={newValue => onChange([values[0], newValue])}
        />
      </Flex>
    );
  }

  return null;
}
