import { useState, useMemo } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { Box, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../ExpressionWidgetHeader";

import { Button } from "./Button";
import { getExample, getName } from "./util";

type Props = {
  query: Lib.Query;
  stageIndex: number;
  onSubmit: (clause: Lib.ExpressionClause, name: string) => void;
  onCancel: () => void;
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
    onSubmit(expressions[0], name);
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
  onCancel: () => void;
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
      <ExpressionWidgetHeader
        title={t`Select column to extract from`}
        onBack={onCancel}
      />
      <Box py="sm">
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
            <Button
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
