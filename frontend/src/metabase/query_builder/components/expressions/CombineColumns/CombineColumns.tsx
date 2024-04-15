import type { FormEventHandler } from "react";
import { useState, useMemo } from "react";
import { t, jt } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { Title, Stack, Flex, Button, Box, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ColumnAndSeparatorRow } from "./ColumnAndSeparatorRow";
import { Example } from "./Example";
import type { ColumnAndSeparator } from "./util";
import {
  getExample,
  getDefaultSeparator,
  getColumnOptions,
  formatSeparator,
  getExpressionName,
  flatten,
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
          }),
        );
        updated.defaultSeparator = defaultSeparator;
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
    setState(state => {
      const lastSeparator =
        state.columnsAndSeparators.at(-1)?.separator ?? state.defaultSeparator;
      return {
        ...state,
        columnsAndSeparators: [
          ...state.columnsAndSeparators,
          { column: null, separator: lastSeparator },
        ],
      };
    });
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
      flatten(columnsAndSeparators),
    );

    onSubmit(name, expression);
  };

  const isValid = state.columnsAndSeparators.every(({ column }) =>
    isNotNull(column),
  );

  const example = useMemo(
    () => getExample(state.columnsAndSeparators),
    [state.columnsAndSeparators],
  );

  return (
    <form onSubmit={handleSubmit}>
      <Box maw="100vw" p="lg" pt={0}>
        <Title my="md" order={4}>{t`Combine columns`}</Title>
        <Stack spacing="lg">
          <Stack spacing="md">
            <Box>
              <Stack spacing="md">
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

          <Example example={example} />

          <Flex align="center" gap="md" justify="end">
            <Button type="submit" variant="filled" disabled={!isValid}>
              {t`Done`}
            </Button>
          </Flex>
        </Stack>
      </Box>
    </form>
  );
}
