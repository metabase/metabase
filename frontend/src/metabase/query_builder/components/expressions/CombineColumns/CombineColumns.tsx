import type { FormEventHandler } from "react";
import { useState, useMemo } from "react";
import { t, jt } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { Card, Title, Stack, Flex, Button, Box, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ColumnAndSeparatorRow } from "./ColumnAndSeparatorRow";
import type { ColumnAndSeparator } from "./util";
import {
  getDefaultSeparator,
  getColumnOptions,
  formatSeparator,
  getExpressionName,
} from "./util";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  onSubmit: (name: string, clause: Lib.ExpressionClause) => void;
}

type State = {
  columnsAndSeparators: ColumnAndSeparator[];
  isUsingDefaultSeparator: boolean;
  defaultSeparator: string;
};

export function CombineColumns({
  query: originalQuery,
  stageIndex: originalStageIndex,
  onSubmit,
}: Props) {
  const [state, setState] = useState<State>({
    columnsAndSeparators: [
      {
        column: null,
        separator: "",
      },
      {
        column: null,
        separator: " ",
      },
    ],
    isUsingDefaultSeparator: true,
    defaultSeparator: " ",
  });

  const { columnsAndSeparators, isUsingDefaultSeparator } = state;

  // TODO
  // const { query, stageIndex } = Lib.asReturned(
  //   originalQuery,
  //   originalStageIndex,
  // );
  const query = originalQuery;
  const stageIndex = originalStageIndex;

  const expressionableColumns = Lib.expressionableColumns(query, stageIndex);
  const options = useMemo(
    () => getColumnOptions(query, stageIndex, expressionableColumns),
    [query, stageIndex, expressionableColumns],
  );

  const handleRowChange = (
    index: number,
    column: Lib.ColumnMetadata | null,
    separator: string,
  ) => {
    setState(state => {
      const updated = {
        ...state,
        columnsAndSeparators: [
          ...state.columnsAndSeparators.slice(0, index),
          { column, separator },
          ...state.columnsAndSeparators.slice(index + 1),
        ],
      };

      if (index === 0 && state.isUsingDefaultSeparator && column) {
        // rewrite the default separators when the first column is selected
        const defaultSeparator = getDefaultSeparator(column);
        updated.columnsAndSeparators = updated.columnsAndSeparators.map(
          columnAndSeparator => ({
            ...columnAndSeparator,
            separator: defaultSeparator,
            defaultSeparator,
          }),
        );
      }

      return updated;
    });
  };

  const handleRowRemove = (index: number) => {
    setState(state => ({
      ...state,
      columnsAndSeparators: [
        ...state.columnsAndSeparators.slice(0, index),
        ...state.columnsAndSeparators.slice(index + 1),
      ],
    }));
  };

  const handleRowAdd = () => {
    setState(state => ({
      ...state,
      columnsAndSeparators: [
        ...state.columnsAndSeparators,
        { column: null, separator: state.defaultSeparator },
      ],
    }));
  };

  const handleEditSeparators = () => {
    setState(state => ({
      ...state,
      isUsingDefaultSeparator: false,
    }));
  };

  const handleSubmit: FormEventHandler = event => {
    event.preventDefault();

    const name = getExpressionName(
      // Ok
      query,
      stageIndex,
      columnsAndSeparators,
    );

    const expression = Lib.expressionClause(
      "concat",
      columnsAndSeparators
        .flatMap(({ column, separator }) => [separator, column])
        .slice(1),
    );

    onSubmit(name, expression);
  };

  const isValid = state.columnsAndSeparators.every(({ column }) =>
    isNotNull(column),
  );

  return (
    <form onSubmit={handleSubmit}>
      <Card maw="100vw" w={474} p="lg">
        <Title mb="lg" order={4}>{t`Combine columns`}</Title>
        <Stack spacing="lg">
          <Stack spacing={12}>
            <Box>
              <Stack spacing="sm">
                {columnsAndSeparators.map(({ column, separator }, index) => (
                  <ColumnAndSeparatorRow
                    key={index}
                    index={index}
                    column={column}
                    separator={separator}
                    options={options}
                    showSeparator={!isUsingDefaultSeparator && index !== 0}
                    showRemove={columnsAndSeparators.length >= 3}
                    onChange={handleRowChange}
                    onRemove={handleRowRemove}
                  />
                ))}
              </Stack>
            </Box>
            <Flex
              align="center"
              gap="md"
              justify={isUsingDefaultSeparator ? "space-between" : "end"}
            >
              {isUsingDefaultSeparator && (
                <Box>
                  <Button p={0} variant="subtle" onClick={handleEditSeparators}>
                    {jt`Separated by ${formatSeparator(
                      state.defaultSeparator,
                    )}`}
                  </Button>
                </Box>
              )}

              <Button
                leftIcon={<Icon name="add" />}
                p={0}
                variant="subtle"
                onClick={handleRowAdd}
              >
                {t`Add column`}
              </Button>
            </Flex>
          </Stack>

          <Flex align="center" gap="md" justify="end">
            <Button type="submit" variant="filled" disabled={!isValid}>
              {t`Done`}
            </Button>
          </Flex>
        </Stack>
      </Card>
    </form>
  );
}
