import cx from "classnames";
import { useContext, useState } from "react";

import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { BooleanFilterPicker } from "../BooleanFilterPicker";
import { CoordinateFilterPicker } from "../CoordinateFilterPicker";
import { DateFilterPicker } from "../DateFilterPicker";
import { DefaultFilterPicker } from "../DefaultFilterPicker";
import { FilterPreviewContext } from "../FilterPreviewContext";
import { NumberFilterPicker } from "../NumberFilterPicker";
import { StringFilterPicker } from "../StringFilterPicker";
import { TimeFilterPicker } from "../TimeFilterPicker";
import type { FilterChangeOpts } from "../types";

import S from "./FilterPickerBody.module.css";

interface FilterPickerBodyProps {
  autoFocus?: boolean;
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
  isNew?: boolean;
  withAddButton?: boolean;
  withSubmitButton?: boolean;
  onChange: (filter: Lib.ExpressionClause, opts: FilterChangeOpts) => void;
  onBack?: () => void;
  readOnly?: boolean;
}

export function FilterPickerBody({
  autoFocus = true,
  query,
  stageIndex,
  column,
  filter,
  isNew = filter == null,
  withAddButton = false,
  withSubmitButton = true,
  onChange,
  onBack,
  readOnly,
}: FilterPickerBodyProps) {
  const preview = useContext(FilterPreviewContext);
  const [draftFilter, setDraftFilter] = useState<Lib.ExpressionClause>();

  const FilterWidget = getFilterWidget(column);
  if (!FilterWidget) {
    return null;
  }

  const body = (
    <Box
      className={cx({
        [S.readOnly]: readOnly,
        [S.withPreview]: preview != null && !readOnly,
      })}
    >
      <FilterWidget
        autoFocus={autoFocus}
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={filter}
        isNew={isNew}
        withAddButton={withAddButton}
        withSubmitButton={withSubmitButton && !readOnly}
        onChange={onChange}
        onDraftChange={preview ? setDraftFilter : undefined}
        onBack={onBack}
        readOnly={readOnly}
      />
    </Box>
  );

  if (!preview || readOnly) {
    return body;
  }

  return (
    <Flex align="stretch">
      {body}
      {preview.renderPreview({ query, stageIndex, filter, draftFilter })}
    </Flex>
  );
}

function getFilterWidget(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return BooleanFilterPicker;
  }
  if (Lib.isTime(column)) {
    return TimeFilterPicker;
  }
  if (Lib.isDateOrDateTime(column)) {
    return DateFilterPicker;
  }
  if (Lib.isNumeric(column)) {
    return Lib.isCoordinate(column)
      ? CoordinateFilterPicker
      : NumberFilterPicker;
  }
  if (Lib.isStringOrStringLike(column)) {
    return StringFilterPicker;
  }
  return DefaultFilterPicker;
}
