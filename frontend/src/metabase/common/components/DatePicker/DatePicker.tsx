import { useState } from "react";
import * as Lib from "metabase-lib";
import { DatePickerShortcuts } from "./DatePickerShortcuts";
import { RelativeDatePicker } from "./RelativeDatePicker";
import type { DateFilterType } from "./types";

export interface DatePickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (clause: Lib.ExpressionClause) => void;
  onBack: () => void;
}

export const DatePicker = ({
  query,
  stageIndex,
  column,
  filter,
  onChange,
  onBack,
}: DatePickerProps) => {
  const [type, setType] = useState(() =>
    getFilterType(query, stageIndex, filter),
  );

  const handleBack = () => {
    setType(undefined);
  };

  switch (type) {
    case "relative":
      return (
        <RelativeDatePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          onChange={onChange}
          onBack={handleBack}
        />
      );
    default:
      return (
        <DatePickerShortcuts
          column={column}
          onChange={onChange}
          onNavigate={setType}
          onBack={onBack}
        />
      );
  }
};

function getFilterType(
  query: Lib.Query,
  stageIndex: number,
  filter?: Lib.FilterClause,
): DateFilterType | undefined {
  if (!filter) {
    return undefined;
  } else if (Lib.isRelativeDateFilter(query, stageIndex, filter)) {
    return "relative";
  } else {
    return undefined;
  }
}
