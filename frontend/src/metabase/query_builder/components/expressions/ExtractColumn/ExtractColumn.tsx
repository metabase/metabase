import { useState, useMemo } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../ExpressionWidgetHeader";

import { isColumnExtractable } from "./util";

type Props = {
  query: Lib.Query;
  stageIndex: number;
  onSubmit: () => void;
  onCancel: () => void;
};

export function ExtractColumn({ query, stageIndex, onCancel }: Props) {
  const [column, setColumn] = useState<Lib.ColumnMetadata | null>(null);

  function handleSubmit() {
    // TODO
  }

  function handleSelect(column: Lib.ColumnMetadata) {
    setColumn(column);
  }

  const extractableColumns = useMemo(() => {
    const columns = Lib.expressionableColumns(query, stageIndex);
    return columns.filter(column =>
      isColumnExtractable(query, stageIndex, column),
    );
  }, [query, stageIndex]);

  if (!column) {
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
            onSelect={handleSelect}
            checkIsColumnSelected={item => item.column === column}
            width="100%"
            alwaysExpanded
            disableSearch
          />
        </Box>
      </>
    );
  }

  const info = Lib.displayInfo(query, stageIndex, column);

  return (
    <>
      <ExpressionWidgetHeader
        title={t`Select part of '${info.longDisplayName}' to extract`}
        onBack={() => setColumn(null)}
      />
      <form onSubmit={handleSubmit}>
        <Box p="lg">TODO</Box>
      </form>
    </>
  );
}
