import cx from "classnames";
import type { MouseEvent } from "react";
import { Fragment, useRef } from "react";
import { t } from "ttag";

import { Tooltip } from "metabase/ui";

import S from "./KeyboardFilterRow.module.css";
import { joinValueLabels, useIsTruncated } from "./ValueText";
import type { DraftOperator } from "./types";
import { formatDraftValue, getPillOperatorLabel } from "./utils";

const MAX_SHOWN_VALUES = 3;

export type FilterPillPart = "column" | "operator" | "values";

interface FilterPillPartsProps {
  columnLabel: string;
  operator: DraftOperator;
  values: string[];
  onPartClick: (part: FilterPillPart) => void;
}

/**
 * Prototype: the column, the operator and the values of a filter, each of
 * them a button that starts to edit that part.
 */
export function FilterPillParts({
  columnLabel,
  operator,
  values,
  onPartClick,
}: FilterPillPartsProps) {
  const handleClick = (part: FilterPillPart) => (event: MouseEvent) => {
    event.stopPropagation();
    onPartClick(part);
  };
  const valuesText = joinValueLabels(
    values.map((value) => formatDraftValue(operator, value)),
    operator.valueKind === "range",
  );
  // Prototype: the values are cut off at a max width (`.truncatedValues`).
  // The tooltip shows them all when they're cut off or past "+N more".
  const valuesRef = useRef<HTMLButtonElement>(null);
  const isTruncated = useIsTruncated(valuesRef, valuesText);
  const hasHiddenValues = values.length > MAX_SHOWN_VALUES;

  return (
    <>
      <button
        className={`${S.segment} ${S.columnSegment}`}
        onClick={handleClick("column")}
      >
        {columnLabel}
      </button>
      {!operator.hasNoPillOperator && (
        <button
          className={`${S.segment} ${S.operatorSegment}`}
          onClick={handleClick("operator")}
        >
          {getPillOperatorLabel(operator)}
        </button>
      )}
      {operator.pillValueLabel != null && (
        <button
          className={`${S.segment} ${S.valuesSegment}`}
          onClick={handleClick("operator")}
        >
          <span className={S.value}>{operator.pillValueLabel}</span>
        </button>
      )}
      {values.length > 0 && (
        <Tooltip
          label={valuesText}
          disabled={!hasHiddenValues && !isTruncated}
          multiline
          maw="20rem"
        >
          <button
            ref={valuesRef}
            className={cx(S.segment, S.valuesSegment, S.truncatedValues)}
            onClick={handleClick("values")}
          >
            <FilterPillValues operator={operator} values={values} />
          </button>
        </Tooltip>
      )}
    </>
  );
}

function FilterPillValues({
  operator,
  values,
}: {
  operator: DraftOperator;
  values: string[];
}) {
  const isRange = operator.valueKind === "range";
  const separator = isRange ? ` ${t`and`} ` : `, `;
  const shownValues =
    values.length > MAX_SHOWN_VALUES
      ? values.slice(0, MAX_SHOWN_VALUES - 1)
      : values;
  const hiddenCount = values.length - shownValues.length;

  return (
    <>
      {shownValues.map((value, index) => (
        <Fragment key={value}>
          {index > 0 && (
            <span
              className={cx(S.conjunction, { [S.rangeConjunction]: isRange })}
            >
              {separator}
            </span>
          )}
          <span className={S.value}>{formatDraftValue(operator, value)}</span>
        </Fragment>
      ))}
      {hiddenCount > 0 && (
        <span className={S.conjunction}> {t`+${hiddenCount} more`}</span>
      )}
    </>
  );
}
