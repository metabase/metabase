import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Card, Flex, Icon, Stack, Title } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { getColumnOptions, getInitialColumnAndSeparator } from "../../lib";
import type { ColumnAndSeparator } from "../../types";
import { ColumnAndSeparatorRow } from "../ColumnAndSeparatorRow";

import styles from "./CombineColumnsDrill.css";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  drillInfo: Lib.CombineColumnsDrillThruInfo;
}

export const CombineColumnsDrill = ({
  query,
  stageIndex,
  drillInfo,
}: Props) => {
  const { availableColumns, defaultSeparator } = drillInfo;
  const options = useMemo(() => {
    return getColumnOptions(query, stageIndex, availableColumns);
  }, [query, stageIndex, availableColumns]);

  const [columnsAndSeparators, setColumnsAndSeparators] = useState([
    getInitialColumnAndSeparator(drillInfo),
  ]);
  const [isUsingDefaultSeparator, setIsUsingDefaultSeparator] = useState(true);

  const handleChange = (index: number, change: Partial<ColumnAndSeparator>) => {
    setColumnsAndSeparators(value => [
      ...value.slice(0, index),
      { ...value[index], ...change },
      ...value.slice(index + 1),
    ]);
  };

  const handleAdd = () => {
    setColumnsAndSeparators(value => [
      ...value,
      getInitialColumnAndSeparator(drillInfo),
    ]);
  };

  const handleRemove = (index: number) => {
    setColumnsAndSeparators(value => [
      ...value.slice(0, index),
      ...value.slice(index + 1),
    ]);
  };

  const handleEditSeparators = () => {
    setIsUsingDefaultSeparator(false);
  };

  const handleSubmit = () => {};

  return (
    <Card className={styles.card} p="lg">
      <Stack spacing="lg">
        <Stack spacing="sm">
          <Title mb="sm" order={4}>{t`Combine with`}</Title>

          {columnsAndSeparators.map(({ column, separator }, index) => (
            <ColumnAndSeparatorRow
              column={column}
              index={index}
              key={index}
              options={options}
              separator={separator}
              showLabels={index === 0 && !isUsingDefaultSeparator}
              showRemove={columnsAndSeparators.length > 1}
              showSeparator={!isUsingDefaultSeparator}
              onChange={handleChange}
              onRemove={handleRemove}
            />
          ))}

          {isUsingDefaultSeparator && (
            <Box>
              <Button p={0} variant="subtle" onClick={handleEditSeparators}>
                {t`Separated by`}{" "}
                {defaultSeparator === " " ? (
                  <>({t`space`})</>
                ) : (
                  defaultSeparator
                )}
              </Button>
            </Box>
          )}
        </Stack>

        <Flex align="center" gap="md" justify="space-between">
          <Button
            leftIcon={<Icon name="add" />}
            p={0}
            variant="subtle"
            onClick={handleAdd}
          >
            Add another column
          </Button>

          <Button type="submit" variant="filled" onClick={handleSubmit}>
            Done
          </Button>
        </Flex>
      </Stack>
    </Card>
  );
};
