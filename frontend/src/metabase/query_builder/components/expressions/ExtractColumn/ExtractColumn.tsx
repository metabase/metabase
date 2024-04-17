import { useState } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../ExpressionWidgetHeader";

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

  if (!column) {
    const columns = Lib.expressionableColumns(query, stageIndex);
    const columnGroups = Lib.groupColumns(columns);

    return (
      <>
        <ExpressionWidgetHeader
          title={t`Select column to extract from`}
          onBack={onCancel}
        />
        <QueryColumnPicker
          query={query}
          stageIndex={stageIndex}
          columnGroups={columnGroups}
          onSelect={handleSelect}
          checkIsColumnSelected={item => item.column === column}
          width="100%"
        />
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
        <Box maw="100vw" p="lg" pt={0}>
          TODO
        </Box>
      </form>
    </>
  );
}
