import { t } from "ttag";

import { Box, Flex, Select, TextInput } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { fromSelectValue, toSelectValue } from "../../lib";
import type { ColumnAndSeparator, ColumnOption } from "../../types";

import styles from "./ColumnAndSeparatorRow.css";

interface Props {
  column: Lib.ColumnMetadata;
  index: number;
  options: ColumnOption[];
  separator: string;
  showLabels: boolean;
  showRemove: boolean;
  showSeparator: boolean;
  onChange: (index: number, change: Partial<ColumnAndSeparator>) => void;
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
}: Props) => {
  return (
    <Flex gap={12}>
      {showSeparator && (
        <TextInput
          className={styles.separator}
          label={showLabels ? t`Separator` : undefined}
          value={separator}
          onChange={event => {
            const separator = event.target.value;
            onChange(index, { separator });
          }}
        />
      )}

      <Select
        className={styles.column}
        data={options}
        label={showLabels ? t`Column` : undefined}
        value={toSelectValue(column)}
        styles={{
          wrapper: {
            "&:not(:only-child)": {
              marginTop: 0,
            },
          },
        }}
        onChange={value => {
          const column = fromSelectValue(value);
          onChange(index, { column });
        }}
      />
    </Flex>
  );
};
