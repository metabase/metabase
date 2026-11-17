import cx from "classnames";
import type { ReactNode, RefObject } from "react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Tooltip } from "metabase/ui";

import S from "./KeyboardFilterRow.module.css";

interface ValueTextProps {
  /** The values as the pill shows them, like "California". */
  labels: string[];
  /** A range: "10 and 20" instead of "10, 20". */
  isRange?: boolean;
  /** The input for one more value follows: the text ends with a comma. */
  hasTrailingSeparator?: boolean;
}

/** The values as one text, like in a tooltip: "California, Texas" or "10 and 20". */
export function joinValueLabels(labels: string[], isRange = false) {
  return labels.join(isRange ? ` ${t`and`} ` : ", ");
}

/**
 * Prototype: the values of a pill being edited, as comma-separated text, like
 * the values of a finished pill (`FilterPillValues`) and Figma. Each value is
 * still a whole unit: Backspace removes the last one, the list ticks them.
 */
export function ValueText({
  labels,
  isRange = false,
  hasTrailingSeparator = false,
}: ValueTextProps) {
  const separator = isRange ? ` ${t`and`} ` : `, `;
  return (
    <>
      {labels.map((label, index) => (
        <Fragment key={`${index}:${label}`}>
          {index > 0 && (
            <span
              className={cx(S.conjunction, { [S.rangeConjunction]: isRange })}
            >
              {separator}
            </span>
          )}
          <span className={S.value}>{label}</span>
        </Fragment>
      ))}
      {hasTrailingSeparator && labels.length > 0 && (
        <span className={S.conjunction}>{", "}</span>
      )}
    </>
  );
}

/** The max width of a tooltip with all the values of a pill. */
const VALUES_TOOLTIP_MAX_WIDTH = "20rem";

/**
 * Prototype: whether the text of an element is cut off by its max width, like
 * the values of a pill. Measured again when the text or the size changes.
 */
export function useIsTruncated(
  ref: RefObject<HTMLElement | null>,
  contentKey: string,
) {
  const [isTruncated, setIsTruncated] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element == null) {
      return;
    }
    const measure = () =>
      setIsTruncated(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, contentKey]);
  return isTruncated;
}

interface ValueBoxProps {
  /** Changes when the content changes, like the values and the typed text. */
  contentKey: string;
  /** All the values as text, for the tooltip while the start is hidden. */
  fullText: string;
  children: ReactNode;
}

/**
 * Prototype: the values and the input of a pill being edited grow with their
 * text up to a max width (`.valueBox` in the CSS). Past it, the start is
 * hidden behind a "…", and the end, with the caret, stays in view, like a
 * text input. While the start is hidden, a tooltip shows all the values.
 */
export function ValueBox({ contentKey, fullText, children }: ValueBoxProps) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box == null) {
      return;
    }
    box.scrollLeft = box.scrollWidth;
    setIsScrolled(box.scrollLeft > 0);
  }, [contentKey]);

  // The "…" shows that the start is hidden. It sits outside the box: a fade
  // on the box itself (a mask) would hide the dropdown of the input too,
  // which is rendered inside the box.
  return (
    <>
      {isScrolled && <span className={S.valueEllipsis}>…</span>}
      <Tooltip
        label={fullText}
        disabled={!isScrolled || fullText === ""}
        multiline
        maw={VALUES_TOOLTIP_MAX_WIDTH}
      >
        <span ref={boxRef} className={S.valueBox}>
          {children}
        </span>
      </Tooltip>
    </>
  );
}
