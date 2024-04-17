import { useState, useMemo } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../ExpressionWidgetHeader";

import { ExtractDateTime } from "./ExtractDateTime";
import { mock_displayInfo } from "./util";

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
    return columns
      .map(column => {
        const extractions = Lib.columnExtractions(query, column);
        return {
          column,
          extractions: extractions.map(extraction =>
            mock_displayInfo(query, stageIndex, extraction),
          ),
        };
      })
      .filter(info => info.extractions.length > 0);
  }, [query, stageIndex]);

  if (!column) {
    const columnGroups = Lib.groupColumns(
      extractableColumns.map(x => x.column),
    );

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
  const Component = component(info);

  return (
    <>
      <ExpressionWidgetHeader
        title={t`Select part of '${info.longDisplayName}' to extract`}
        onBack={() => setColumn(null)}
      />
      <form onSubmit={handleSubmit}>
        <Box p="sm">
          <Component />
        </Box>
      </form>
    </>
  );
}

function component(info: Lib.ColumnDisplayInfo) {
  if (info.semanticType === "type/Email") {
    return ExtractEmail;
  }

  if (info.semanticType === "type/URL") {
    return ExtractUrl;
  }

  if (info.effectiveType === "type/DateTime") {
    return ExtractDateTime;
  }

  return null;
}

function ExtractEmail() {
  return <div>Email</div>;
}

function ExtractUrl() {
  return <div>Url</div>;
}
