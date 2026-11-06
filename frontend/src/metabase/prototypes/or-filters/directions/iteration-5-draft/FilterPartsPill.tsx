import cx from "classnames";
import { Fragment, type MouseEvent } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import S from "./FilterPartsPill.module.css";
import type { DraftState } from "./draft-pill/types";
import { formatDraftValue, getPillOperatorLabel } from "./draft-pill/utils";

interface FilterPartsPillProps {
  /** Splits the pill into column, operator and values; without it, the label is split instead. */
  draft: DraftState | undefined;
  label: string;
  /** Being edited: the draft pill's filter-color ring. */
  isActive?: boolean;
  onClick: () => void;
  onRemoveClick: () => void;
}

/** A filter pill as in the Figma: bold column, plain operator, values in the filter color. */
export function FilterPartsPill({
  draft,
  label,
  isActive = false,
  onClick,
  onRemoveClick,
}: FilterPartsPillProps) {
  const handleRemoveClick = (event: MouseEvent) => {
    event.stopPropagation();
    onRemoveClick();
  };

  const parts = getDraftParts(draft) ?? getLabelParts(label);

  return (
    <div
      className={cx(S.pill, { [S.pillActive]: isActive })}
      data-testid="filter-pill"
      onClick={onClick}
    >
      <span className={S.parts}>
        {parts != null ? (
          <>
            <span className={S.column}>{parts.column}</span>
            <span className={S.operator}>{parts.operator}</span>
            {parts.values.map((value, index) => (
              <Fragment key={index}>
                {parts.isRange && index === 1 && (
                  <span className={S.operator}>{t`and`}</span>
                )}
                <span className={S.value}>{value}</span>
              </Fragment>
            ))}
          </>
        ) : (
          <span className={S.column}>{label}</span>
        )}
      </span>
      <Icon
        className={S.close}
        name="close"
        size={12}
        role="button"
        aria-label={t`Remove`}
        onClick={handleRemoveClick}
      />
    </div>
  );
}

type PillParts = {
  column: string;
  operator: string;
  values: string[];
  isRange: boolean;
};

function getDraftParts(draft: DraftState | undefined): PillParts | undefined {
  const { column, operator, values = [] } = draft ?? {};
  if (column == null || operator == null) {
    return undefined;
  }
  const isRange = operator.valueKind === "range";
  const labels = values.map((value) => formatDraftValue(operator, value));
  return {
    column: column.label,
    operator: getPillOperatorLabel(operator),
    values: isRange ? labels : labels.length > 0 ? [labels.join(", ")] : [],
    isRange,
  };
}

/** Filters the inline editor can't read (dates, summaries…) split from their sentence, like "Count is greater than 10". */
const LABEL_PARTS_REGEX =
  /^(.+?) ((?:is not|is|contains|does not contain|starts with|ends with|excludes)(?: (?:between|greater than or equal to|less than or equal to|greater than|less than|equal to|not|empty|before|after|on or before|on or after|on|in the (?:previous|next|current)|in))*)(?: (.+))?$/;

function getLabelParts(label: string): PillParts | undefined {
  const match = LABEL_PARTS_REGEX.exec(label);
  if (match == null) {
    return undefined;
  }
  const [, column, operator, value] = match;
  const isRange = / between$/.test(operator) && / and /.test(value ?? "");
  return {
    column,
    operator,
    values: value == null ? [] : isRange ? value.split(" and ") : [value],
    isRange,
  };
}
