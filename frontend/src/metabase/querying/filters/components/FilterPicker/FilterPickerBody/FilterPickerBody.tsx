import cx from "classnames";
import { useCallback, useContext, useState } from "react";

import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { BooleanFilterPicker } from "../BooleanFilterPicker";
import { CoordinateFilterPicker } from "../CoordinateFilterPicker";
import { DateFilterPicker } from "../DateFilterPicker";
import { DefaultFilterPicker } from "../DefaultFilterPicker";
import {
  FilterFooterLabelContext,
  FilterPreviewContext,
} from "../FilterPreviewContext";
import { NumberFilterPicker } from "../NumberFilterPicker";
import { StringFilterPicker } from "../StringFilterPicker";
import { TimeFilterPicker } from "../TimeFilterPicker";
import type { FilterChangeOpts } from "../types";
import { useFilterAutoApply } from "../use-filter-auto-apply";

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
  /** Prototype: closes the picker after an explicit submit, when filters apply as the user changes them. */
  onClose?: () => void;
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
  onClose,
  readOnly,
}: FilterPickerBodyProps) {
  const livePreview = useContext(FilterPreviewContext);
  const [draftFilter, setDraftFilter] = useState<Lib.ExpressionClause>();
  const autoApply = useFilterAutoApply({
    query,
    stageIndex,
    filter,
    onChange,
    onClose,
  });
  const isAutoApply = autoApply.isActive && !readOnly;
  // With auto-apply, the question itself shows the filter, so there is no preview.
  const preview = isAutoApply ? null : livePreview;
  const { onDraftChange: onAutoApplyDraftChange } = autoApply;
  const handleDraftChange = useCallback(
    (filter: Lib.ExpressionClause | undefined) => {
      setDraftFilter(filter);
      onAutoApplyDraftChange(filter);
    },
    [onAutoApplyDraftChange],
  );

  const FilterWidget = getFilterWidget(column);
  if (!FilterWidget) {
    return null;
  }

  const body = (
    <Box
      {...(isAutoApply ? autoApply.containerProps : undefined)}
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
        withSubmitButton={withSubmitButton && !readOnly && !isAutoApply}
        onChange={isAutoApply ? autoApply.onChange : onChange}
        onDraftChange={
          isAutoApply ? handleDraftChange : preview ? setDraftFilter : undefined
        }
        onBack={onBack}
        readOnly={readOnly}
      />
    </Box>
  );

  if (!preview || readOnly) {
    return body;
  }

  const previewProps = { query, stageIndex, filter, draftFilter };
  return (
    <FilterFooterLabelContext.Provider
      value={preview.renderFooterLabel?.(previewProps)}
    >
      <Flex align="stretch">
        {body}
        {preview.renderPreview(previewProps)}
      </Flex>
    </FilterFooterLabelContext.Provider>
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
