import type { FormEventHandler } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Card, Flex, Icon, Stack, Title } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { ColumnAndSeparator } from "../../types";
import {
  formatSeparator,
  getColumnOptions,
  getInitialColumnAndSeparator,
  getNextColumnAndSeparator,
} from "../../utils";
import { ColumnAndSeparatorRow } from "../ColumnAndSeparatorRow";

import styles from "./CombineColumnsDrill.css";

interface Props {
  drillInfo: Lib.CombineColumnsDrillThruInfo;
  query: Lib.Query;
  stageIndex: number;
  onSubmit: (columnsAndSeparators: ColumnAndSeparator[]) => void;
}

export const CombineColumnsDrill = ({
  drillInfo,
  query,
  stageIndex,
  onSubmit,
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
      getNextColumnAndSeparator(drillInfo, options, columnsAndSeparators),
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

  const handleSubmit: FormEventHandler = event => {
    event.preventDefault();
    onSubmit(columnsAndSeparators);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className={styles.card} maw="100vw" w={340} p="lg">
        <Title mb="md" order={4}>{t`Combine with`}</Title>

        <Stack spacing="lg">
          <Stack spacing="sm">
            <Stack className={styles.inputs} mah="25vh" spacing="sm">
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
            </Stack>

            {isUsingDefaultSeparator && (
              <Box>
                <Button p={0} variant="subtle" onClick={handleEditSeparators}>
                  {t`Separated by`} {formatSeparator(defaultSeparator)}
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

            <Button type="submit" variant="filled">
              Done
            </Button>
          </Flex>
        </Stack>
      </Card>
    </form>
  );
};
