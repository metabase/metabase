import type { MouseEvent } from "react";
import { Fragment } from "react";
import { t } from "ttag";

import S from "./KeyboardFilterRow.module.css";
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

  return (
    <>
      <button
        className={`${S.segment} ${S.columnSegment}`}
        onClick={handleClick("column")}
      >
        {columnLabel}
      </button>
      <button
        className={`${S.segment} ${S.operatorSegment}`}
        onClick={handleClick("operator")}
      >
        {getPillOperatorLabel(operator)}
      </button>
      {values.length > 0 && (
        <button
          className={`${S.segment} ${S.valuesSegment}`}
          onClick={handleClick("values")}
        >
          <FilterPillValues operator={operator} values={values} />
        </button>
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
  const separator = operator.valueKind === "range" ? ` ${t`and`} ` : `, `;
  const shownValues =
    values.length > MAX_SHOWN_VALUES
      ? values.slice(0, MAX_SHOWN_VALUES - 1)
      : values;
  const hiddenCount = values.length - shownValues.length;

  return (
    <>
      {shownValues.map((value, index) => (
        <Fragment key={value}>
          {index > 0 && <span className={S.conjunction}>{separator}</span>}
          <span className={S.value}>{formatDraftValue(operator, value)}</span>
        </Fragment>
      ))}
      {hiddenCount > 0 && (
        <span className={S.conjunction}> {t`+${hiddenCount} more`}</span>
      )}
    </>
  );
}
