import cx from "classnames";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import S from "./ExpressionDebugger.module.css";
import type { Segment } from "./steps";

/** How long the part that a step evaluates takes to fade out. */
export const LEAVE_DURATION = 180;

// After the part fades out, its result fades in from a blur, while the rest
// of the code moves to its new place.
const ENTER_FROM = { opacity: 0, filter: "blur(4px)" };
const ENTER_TO = {
  opacity: 1,
  filter: "blur(0px)",
  transition: { duration: 0.25 },
};
const MOVE = { layout: { duration: 0.3, ease: "easeInOut" } } as const;

/**
 * The code of a step. The same text keeps its key in each step, so that only
 * the text that changes fades, and the rest moves.
 */
export function AnimatedStepCode({
  segments,
  leavingKeys,
  animateEnter,
}: {
  segments: Segment[];
  /** The text that the next step replaces, which fades out now. */
  leavingKeys: Set<string>;
  /** False for the first step that shows, which needs no animation. */
  animateEnter: boolean;
}) {
  return (
    <code className={cx(S.code, S.animatedCode)}>
      {segments.flatMap((segment, index) => {
        const isNext = Boolean(segment.isNext);
        const hasLabel = segment.columnName != null;
        // A label starts the highlight of the part to evaluate, when the
        // part starts with this value.
        const isNextStart = isNext && !segments[index - 1]?.isNext;
        const className = cx(S.segment, {
          [S.value]: segment.isValue,
          [S.result]: segment.isResult,
          [S.null]: segment.isValue && segment.text === "null",
          [S.nextPart]: isNext,
          [S.nextStart]: isNextStart && !hasLabel,
          [S.nextEnd]: isNext && !segments[index + 1]?.isNext,
          [S.leaving]: leavingKeys.has(segment.key),
        });
        // The column that the value comes from, while it is the value of
        // the column.
        const label = hasLabel
          ? [
              <Piece
                key={`${segment.key}-label`}
                className={cx(S.segment, {
                  [S.nextPart]: isNext,
                  [S.nextStart]: isNextStart,
                  [S.leaving]: leavingKeys.has(segment.key),
                })}
                text={
                  <span className={S.columnLabel}>{segment.columnName}</span>
                }
                animateEnter={animateEnter}
              />,
            ]
          : [];
        // A box can't hold a line break, so each line of the text is a box
        // of its own, with a break between them. The indent of a line is not
        // highlighted.
        return segment.text.split("\n").flatMap((line, lineIndex) => {
          const key = `${segment.key}-${lineIndex}`;
          const [, indent, text] = /^(\s*)(.*)$/s.exec(line) ?? ["", "", line];
          const hasIndent = lineIndex > 0 && indent !== "";
          const pieceText = hasIndent ? text : line;
          return [
            ...(lineIndex === 0 ? label : []),
            ...(lineIndex > 0 ? [<br key={`${key}-break`} />] : []),
            ...(hasIndent
              ? [
                  <Piece
                    key={`${key}-indent`}
                    className={S.segment}
                    text={indent}
                    animateEnter={animateEnter}
                  />,
                ]
              : []),
            ...(pieceText !== ""
              ? [
                  <Piece
                    key={key}
                    className={className}
                    text={pieceText}
                    animateEnter={animateEnter}
                  />,
                ]
              : []),
          ];
        });
      })}
    </code>
  );
}

function Piece({
  className,
  text,
  animateEnter,
}: {
  className: string;
  text: ReactNode;
  animateEnter: boolean;
}) {
  return (
    <motion.span
      layout="position"
      initial={animateEnter ? ENTER_FROM : false}
      animate={ENTER_TO}
      transition={MOVE}
      className={className}
    >
      {text}
    </motion.span>
  );
}
