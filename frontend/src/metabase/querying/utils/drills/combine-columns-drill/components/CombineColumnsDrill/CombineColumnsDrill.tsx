import type { FormEventHandler } from "react";
import { useMemo, useState } from "react";
import { jt, t } from "ttag";

import { Box, Button, Card, Flex, Icon, Stack, Title, rem } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { ColumnAndSeparator } from "../../types";
import {
  getColumnOptions,
  getInitialColumnAndSeparator,
  getNextColumnAndSeparator,
} from "../../utils";
import { ColumnAndSeparatorRow } from "../ColumnAndSeparatorRow";
import { Preview } from "../Preview";

import styles from "./CombineColumnsDrill.module.css";

interface Props {
  drill: Lib.DrillThru;
  drillInfo: Lib.CombineColumnsDrillThruInfo;
  query: Lib.Query;
  stageIndex: number;
  onSubmit: (columnsAndSeparators: ColumnAndSeparator[]) => void;
}

export const CombineColumnsDrill = ({
  drill,
  drillInfo,
  query,
  stageIndex,
  onSubmit,
}: Props) => {
  const { availableColumns, column } = drillInfo;
  const columnInfo = Lib.displayInfo(query, stageIndex, column);
  const options = useMemo(() => {
    return getColumnOptions(query, stageIndex, availableColumns);
  }, [query, stageIndex, availableColumns]);
  const [columnsAndSeparators, setColumnsAndSeparators] = useState([
    getInitialColumnAndSeparator(drillInfo),
  ]);

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

  const handleSubmit: FormEventHandler = event => {
    event.preventDefault();
    onSubmit(columnsAndSeparators);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className={styles.card} maw="100vw" miw={340} p="lg">
        <Title
          mb="lg"
          order={4}
        >{jt`Combine ${columnInfo.displayName} with`}</Title>

        <Stack spacing="lg">
          <Stack spacing="sm">
            <Stack className={styles.inputs} mah="50vh" spacing="sm">
              {columnsAndSeparators.map(({ column, separator }, index) => (
                <ColumnAndSeparatorRow
                  column={column}
                  index={index}
                  key={index}
                  options={options}
                  separator={separator}
                  showLabels={index === 0}
                  showRemove={columnsAndSeparators.length > 1}
                  onChange={handleChange}
                  onRemove={handleRemove}
                />
              ))}
            </Stack>

            <Box>
              <Button
                leftIcon={<Icon name="add" />}
                px={0}
                py={rem(4)}
                variant="subtle"
                onClick={handleAdd}
              >
                {t`Add another column`}
              </Button>
            </Box>
          </Stack>

          <Preview
            columnsAndSeparators={columnsAndSeparators}
            drill={drill}
            query={query}
            stageIndex={stageIndex}
          />

          <Flex align="center" gap="md" justify="end">
            <Button type="submit" variant="filled">
              {t`Done`}
            </Button>
          </Flex>
        </Stack>
      </Card>
    </form>
  );
};
