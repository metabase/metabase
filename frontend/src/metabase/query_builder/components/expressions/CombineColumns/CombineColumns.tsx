import type { FormEventHandler } from "react";
import { useState, useMemo } from "react";
import { t, jt } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { Stack, Flex, Button, Box, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ColumnAndSeparatorRow } from "./ColumnAndSeparatorRow";
import { Example } from "./Example";
import type { ColumnAndSeparator } from "./util";
import {
  getExample,
  getDefaultSeparator,
  formatSeparator,
  getExpressionName,
  getNextColumnAndSeparator,
  flatten,
} from "./util";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  onSubmit: (name: string, clause: Lib.ExpressionClause) => void;
  width?: number;

  /**
   * If set, use this as the first column to combine.
   */
  column?: Lib.ColumnMetadata;

  /**
   * If true, automatically select the next column to combine when first
   * rendering the component or when adding a new column.
   */
  autoPickColumn?: boolean;
}

type State = {
  columnsAndSeparators: ColumnAndSeparator[];
  isUsingDefaultSeparator: boolean;
  defaultSeparator: string;
};

export function CombineColumns({
  query,
  stageIndex,
  onSubmit,
  width,
  column,
  autoPickColumn = false,
}: Props) {
  const expressionableColumns = Lib.expressionableColumns(query, stageIndex);

  const [state, setState] = useState<State>(() => {
    const defaultSeparator = getDefaultSeparator(column);

    const firstColumnAndSeparator = {
      column: column ?? (autoPickColumn ? expressionableColumns[0] : null),
      separator: null,
    };

    const secondColumnAndSeparator = getNextColumnAndSeparator(
      expressionableColumns,
      defaultSeparator,
      [firstColumnAndSeparator],
      autoPickColumn,
    );

    return {
      columnsAndSeparators: [firstColumnAndSeparator, secondColumnAndSeparator],
      isUsingDefaultSeparator: true,
      defaultSeparator,
    };
  });

  const { columnsAndSeparators, isUsingDefaultSeparator } = state;

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
        // rewrite the default separator when the first column is selected
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
      return {
        ...state,
        columnsAndSeparators: [
          ...state.columnsAndSeparators,
          getNextColumnAndSeparator(
            expressionableColumns,
            state.defaultSeparator,
            state.columnsAndSeparators,
            autoPickColumn,
          ),
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

    const name = getExpressionName(query, stageIndex, columnsAndSeparators);

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
      <Box maw="100vw" w={width} p="lg" pt={0}>
        <Stack spacing="lg" mt="lg">
          <Stack spacing="md">
            <Box>
              <Stack spacing="md">
                {columnsAndSeparators.map(
                  (item, index) =>
                    // Do not allow editing the first column when it is passed from
                    // the props.
                    (!column || index > 0) && (
                      <ColumnAndSeparatorRow
                        key={index}
                        query={query}
                        stageIndex={stageIndex}
                        index={index}
                        columns={expressionableColumns}
                        column={item.column}
                        separator={item.separator ?? ""}
                        showSeparator={!isUsingDefaultSeparator && index !== 0}
                        showRemove={columnsAndSeparators.length >= 3}
                        onChange={handleRowChange}
                        onRemove={handleRowRemove}
                      />
                    ),
                )}
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
