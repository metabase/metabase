import type { FormEventHandler } from "react";
import { useMemo, useState } from "react";
import { jt, t } from "ttag";

import { Box, Button, Card, Flex, Icon, Stack, Title } from "metabase/ui";
import * as Lib from "metabase-lib";

import { usePreview } from "../../hooks";
import type { ColumnAndSeparator } from "../../types";
import {
  formatSeparator,
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
  query: originalQuery,
  stageIndex: originalStageIndex,
  onSubmit,
}: Props) => {
  const columnInfo = Lib.displayInfo(originalQuery, originalStageIndex, column);
  const { query, stageIndex } = Lib.asReturned(
    originalQuery,
    originalStageIndex,
  );
  const expressionableColumns = Lib.expressionableColumns(query, stageIndex);
  const options = useMemo(
    () => getColumnOptions(query, stageIndex, expressionableColumns),
    [query, stageIndex, expressionableColumns],
  );
  const defaultSeparator = getDefaultSeparator(column);
  const [isUsingDefaultSeparator, setIsUsingDefaultSeparator] = useState(true);
  const [columnsAndSeparators, setColumnsAndSeparators] = useState([
    {
      column: expressionableColumns[0],
      separator: defaultSeparator,
    },
  ]);
  const expressionClause = useMemo(
    () => getDrillExpressionClause(column, columnsAndSeparators),
    [column, columnsAndSeparators],
  );
  const { error, preview } = usePreview(
    originalQuery,
    originalStageIndex,
    expressionClause,
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
        expressionableColumns,
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

  const handleEditSeparators = () => {
    setIsUsingDefaultSeparator(false);
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
      <Card className={styles.card} maw="100vw" miw={474} p="lg">
        <Title
          mb="md"
          order={4}
        >{jt`Combine “${columnInfo.displayName}” with other columns`}</Title>

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
                  showLabels={!isUsingDefaultSeparator && index === 0}
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
                  {jt`Separated by ${formatSeparator(defaultSeparator)}`}
                </Button>
              </Box>
            )}
          </Stack>

          <Preview error={error} preview={preview} />

          <Flex align="center" gap="md" justify="space-between">
            <Button
              leftIcon={<Icon name="add" />}
              p={0}
              variant="subtle"
              onClick={handleAdd}
            >
              {t`Add another column`}
            </Button>

            <Button type="submit" variant="filled">
              {t`Done`}
            </Button>
          </Flex>
        </Stack>
      </Card>
    </form>
  );
};
