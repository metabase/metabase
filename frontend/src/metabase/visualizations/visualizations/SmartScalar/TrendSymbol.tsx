import type { ChangeColorName } from "./compute";

// Paths exported from the "Number direction symbol" component in the
// "Charts visual improvements" Figma spec (16px frame).
const UP_PATH =
  "M7.31693 3.85346C7.66721 3.41583 8.33287 3.41582 8.68314 3.85346L14.2378 10.7968C14.827 11.5334 14.3031 12.6248 13.3599 12.6249H2.64017C1.75603 12.6247 1.24028 11.6661 1.66458 10.9394L1.76224 10.7968L7.31693 3.85346Z";
const DOWN_PATH =
  "M13.3599 3.375C14.3029 3.37531 14.827 4.46662 14.2378 5.20312L8.68309 12.1465C8.33284 12.5841 7.66718 12.5841 7.31688 12.1465L1.76122 5.20312C1.17213 4.46658 1.697 3.37518 2.64012 3.375H13.3599Z";
const NO_CHANGE_PATH =
  "M1 8C1 6.61929 2.11929 5.5 3.5 5.5H12.5C13.8807 5.5 15 6.61929 15 8C15 9.38071 13.8807 10.5 12.5 10.5H3.5C2.11929 10.5 1 9.38071 1 8Z";

interface TrendSymbolProps {
  direction: "arrow_up" | "arrow_down" | "no_change";
  colorName: ChangeColorName | undefined;
  size: number;
}

export const TrendSymbol = ({
  direction,
  colorName,
  size,
}: TrendSymbolProps) => {
  const isNoChange = direction === "no_change";
  const path = isNoChange
    ? NO_CHANGE_PATH
    : direction === "arrow_up"
      ? UP_PATH
      : DOWN_PATH;
  const fill = isNoChange
    ? "var(--mb-color-text-primary)"
    : `var(--mb-color-${colorName ?? "feedback-positive"})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      data-testid="trend-symbol"
      data-direction={direction}
    >
      <path d={path} fill={fill} opacity={isNoChange ? 0.2 : 1} />
    </svg>
  );
};
