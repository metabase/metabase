import { useState, useMemo } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { Text, Box, Stack, Button, Title, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../ExpressionWidgetHeader";

import styles from "./ExtractColumn.module.css";
import { getExample, getName } from "./util";

type Props = {
  query: Lib.Query;
  stageIndex: number;
  onSubmit: (
    clause: Lib.ExpressionClause,
    name: string,
    extraction: Lib.ColumnExtraction,
  ) => void;
  onCancel?: () => void;
};

export function ExtractColumn({
  query,
  stageIndex,
  onCancel,
  onSubmit,
}: Props) {
  const [column, setColumn] = useState<Lib.ColumnMetadata | null>(null);

  function handleSelect(column: Lib.ColumnMetadata) {
    setColumn(column);
  }

  if (!column) {
    return (
      <ColumnPicker
        query={query}
        stageIndex={stageIndex}
        column={column}
        onCancel={onCancel}
        onSelect={handleSelect}
      />
    );
  }

  function handleSubmit(
    info: Lib.ColumnExtractionInfo,
    extraction: Lib.ColumnExtraction,
  ) {
    // @todo this is a hack until Lib supports building an expression from an extraction
    const newQuery = Lib.extract(query, stageIndex, extraction);
    const expressions = Lib.expressions(newQuery, stageIndex);
    const name = getName(query, stageIndex, info);
    const lastExpression = expressions.at(-1);
    if (lastExpression) {
      onSubmit(lastExpression, name, extraction);
    }
  }

  return (
    <ExtractionPicker
      query={query}
      stageIndex={stageIndex}
      column={column}
      onSelect={handleSubmit}
      onCancel={() => setColumn(null)}
    />
  );
}

function ColumnPicker({
  query,
  stageIndex,
  column,
  onSelect,
  onCancel,
}: {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata | null;
  onSelect: (column: Lib.ColumnMetadata) => void;
  onCancel?: () => void;
}) {
  const extractableColumns = useMemo(
    () =>
      Lib.expressionableColumns(query, stageIndex).filter(
        column => Lib.columnExtractions(query, column).length > 0,
      ),
    [query, stageIndex],
  );
  const columnGroups = Lib.groupColumns(extractableColumns);

  return (
    <>
      {onCancel && (
        <ExpressionWidgetHeader
          title={t`Select column to extract from`}
          onBack={onCancel}
        />
      )}
      <Box py="sm">
        {!onCancel && (
          <Title p="md" pt="sm" pb={0} order={6}>
            {t`Select column to extract from`}
          </Title>
        )}
        <QueryColumnPicker
          query={query}
          stageIndex={stageIndex}
          columnGroups={columnGroups}
          onSelect={onSelect}
          checkIsColumnSelected={item => item.column === column}
          width="100%"
          alwaysExpanded
          disableSearch
        />
      </Box>
    </>
  );
}

function ExtractionPicker({
  query,
  stageIndex,
  column,
  onSelect,
  onCancel,
}: {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  onSelect: (
    info: Lib.ColumnExtractionInfo,
    extraction: Lib.ColumnExtraction,
  ) => void;
  onCancel: () => void;
}) {
  const info = Lib.displayInfo(query, stageIndex, column);

  const extractions = useMemo(
    () =>
      Lib.columnExtractions(query, column).map(extraction => ({
        extraction,
        info: Lib.displayInfo(query, stageIndex, extraction),
      })),
    [query, stageIndex, column],
  );

  return (
    <>
      <ExpressionWidgetHeader
        title={t`Select part of '${info.longDisplayName}' to extract`}
        onBack={onCancel}
      />
      <Box p="sm">
        <Stack spacing={0}>
          {extractions.map(extraction => (
            <ExtractColumnButton
              key={extraction.info.tag}
              title={extraction.info.displayName}
              example={getExample(extraction.info) ?? ""}
              onClick={() => onSelect(extraction.info, extraction.extraction)}
            />
          ))}
        </Stack>
      </Box>
    </>
  );
}

function ExtractColumnButton({
  title,
  example,
  onClick,
}: {
  title: string;
  example: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="unstyled"
      type="button"
      p="sm"
      className={styles.button}
      classNames={{
        inner: styles.inner,
        label: styles.label,
      }}
      onClick={onClick}
    >
      <Flex align="center" justify="space-between" gap="1rem">
        <Text color="text-dark" className={styles.content} weight="bold" p={0}>
          {title}
        </Text>
        <Text color="text-light" size="sm" className={styles.example}>
          {example}
        </Text>
      </Flex>
    </Button>
  );
}
