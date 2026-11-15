import cx from "classnames";
import { type CSSProperties, type Ref, forwardRef } from "react";
import { t } from "ttag";

import S from "./LegendItemDot.module.css";

interface LegendItemDotProps {
  isVisible: boolean;
  color: string;
  size?: string;
  onClick?: (event: React.MouseEvent) => void;
}

export const LegendItemDot = forwardRef<
  HTMLButtonElement | HTMLDivElement,
  LegendItemDotProps
>(function LegendItemDot(
  { isVisible = true, color, size = "0.5rem", onClick },
  ref,
) {
  const sizeStyle = {
    minWidth: size,
    width: size,
    height: size,
  };
  const rootStyle: CSSProperties & { "--legend-dot-color": string } = {
    ...sizeStyle,
    "--legend-dot-color": color,
  };

  const circles = (
    <>
      <span className={cx(S.circle, S.outerCircle)} style={sizeStyle} />
      <span
        className={cx(S.circle, S.innerCircle, { [S.visible]: isVisible })}
        style={sizeStyle}
      />
    </>
  );

  if (onClick) {
    return (
      <button
        className={S.rootButton}
        aria-label={isVisible ? t`Hide series` : t`Show series`}
        onClick={onClick}
        style={rootStyle}
        // the forwarded ref matches the rendered element: a button when clickable
        ref={ref as Ref<HTMLButtonElement>}
      >
        {circles}
      </button>
    );
  }

  return (
    <div
      className={S.root}
      data-testid="legend-item-dot"
      style={rootStyle}
      // the forwarded ref matches the rendered element: a div when not clickable
      ref={ref as Ref<HTMLDivElement>}
    >
      {circles}
    </div>
  );
});
