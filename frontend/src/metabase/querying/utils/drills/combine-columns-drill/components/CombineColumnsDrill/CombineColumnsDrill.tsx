import type { FormEventHandler } from "react";
import { useMemo, useState } from "react";
import { jt, t } from "ttag";

import { Box, Button, Card, Flex, Icon, Stack, Title, rem } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { ColumnAndSeparator } from "../../types";
import {
  getColumnOptions,
  getDefaultSeparator,
  getDrillExpressionClause,
  getExpressionName,
  getNextColumnAndSeparator,
} from "../../utils";
import { ColumnAndSeparatorRow } from "../ColumnAndSeparatorRow";
import { Preview } from "../Preview";

import styles from "./CombineColumnsDrill.module.css";

interface Props {
  column: Lib.ColumnMetadata;
  query: Lib.Query;
  stageIndex: number;
  onSubmit: (query: Lib.Query) => void;
}

export const CombineColumnsDrill = ({
  column,
  query,
  stageIndex,
  onSubmit,
}: Props) => {
  const defaultSeparator = getDefaultSeparator(column);
  const columnInfo = Lib.displayInfo(query, stageIndex, column);
  const columns = Lib.expressionableColumns(query, stageIndex);
  const options = useMemo(() => {
    return getColumnOptions(query, stageIndex, columns);
  }, [query, stageIndex, columns]);
  const [columnsAndSeparators, setColumnsAndSeparators] = useState([
    {
      column: columns[0],
      separator: defaultSeparator,
    },
  ]);
  const expressionClause = useMemo(
    () => getDrillExpressionClause(column, columnsAndSeparators),
    [column, columnsAndSeparators],
  );

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
      getNextColumnAndSeparator(
        columns,
        defaultSeparator,
        options,
        columnsAndSeparators,
      ),
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

    const name = getExpressionName(
      query,
      stageIndex,
      column,
      columnsAndSeparators,
    );
    const newQuery = Lib.expression(query, stageIndex, name, expressionClause);

    onSubmit(newQuery);
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
            expressionClause={expressionClause}
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
