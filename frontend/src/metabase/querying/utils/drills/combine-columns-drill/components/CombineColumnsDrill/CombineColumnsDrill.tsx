import type { FormEventHandler } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Card,
  Flex,
  Icon,
  ScrollArea,
  Stack,
  Title,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import type { ColumnAndSeparator } from "../../types";
import {
  formatSeparator,
  getDefaultSeparator,
  getDrillExpressionClause,
  getExample,
  getExpressionName,
  getNextColumnAndSeparator,
} from "../../utils";
import { ColumnAndSeparatorRow } from "../ColumnAndSeparatorRow";
import { Example } from "../Example";

/**
 * Required to not cut off the outline of focused "x" button
 */
const OVERFLOW_SAFETY_MARGIN = 16;

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
  const columnInfo = Lib.displayInfo(query, stageIndex, column);
  const expressionableColumns = Lib.expressionableColumns(query, stageIndex);
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
  const example = useMemo(() => {
    return getExample(column, columnsAndSeparators);
  }, [column, columnsAndSeparators]);

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
      <Card maw="100vw" w={474} p="lg">
        <Title
          mb="lg"
          order={4}
        >{t`Combine “${columnInfo.displayName}” with other columns`}</Title>

        <Stack spacing="lg">
          <Stack spacing={12}>
            <ScrollArea mx={-OVERFLOW_SAFETY_MARGIN}>
              <Box mah="50vh" px={OVERFLOW_SAFETY_MARGIN}>
                <Stack spacing="sm">
                  {columnsAndSeparators.map(({ column, separator }, index) => (
                    <ColumnAndSeparatorRow
                      query={query}
                      stageIndex={stageIndex}
                      column={column}
                      columns={expressionableColumns}
                      index={index}
                      key={index}
                      separator={separator}
                      showLabels={index === 0}
                      showRemove={columnsAndSeparators.length > 1}
                      showSeparator={!isUsingDefaultSeparator}
                      onChange={handleChange}
                      onRemove={handleRemove}
                    />
                  ))}
                </Stack>
              </Box>
            </ScrollArea>

            <Flex
              align="center"
              gap="md"
              justify={isUsingDefaultSeparator ? "space-between" : "end"}
            >
              {isUsingDefaultSeparator && (
                <Box>
                  <Button p={0} variant="subtle" onClick={handleEditSeparators}>
                    {t`Separated by ${formatSeparator(defaultSeparator)}`}
                  </Button>
                </Box>
              )}

              <Button
                leftIcon={<Icon name="add" />}
                p={0}
                variant="subtle"
                onClick={handleAdd}
              >
                {t`Add column`}
              </Button>
            </Flex>
          </Stack>

          <Example example={example} />

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
