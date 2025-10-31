import { type Ref, forwardRef } from "react";
import { t } from "ttag";

import {
  InnerCircle,
  OuterCircle,
  Root,
  RootButton,
} from "./LegendItemDot.styled";

interface LegendItemDotProps {
  isVisible: boolean;
  color: string;
  size?: string; // px
  onClick?: () => void;
}

export const LegendItemDot = forwardRef<
  HTMLButtonElement | HTMLDivElement,
  LegendItemDotProps
>(function LegendItemDot(
  { isVisible = true, color, size = "8px", onClick },
  ref,
) {
  const sizeStyle = {
    minWidth: size,
    width: size,
    height: size,
  };

  if (onClick) {
    return (
      <RootButton
        aria-label={isVisible ? t`Hide series` : t`Show series`}
        onClick={onClick}
        style={sizeStyle}
        ref={ref as Ref<HTMLButtonElement>}
      >
        <OuterCircle style={sizeStyle} />
        <InnerCircle color={color} isVisible={isVisible} style={sizeStyle} />
      </RootButton>
    );
  }

  return (
    <Root
      data-testid="legend-item-dot"
      style={sizeStyle}
      ref={ref as Ref<HTMLDivElement>}
    >
      <OuterCircle style={sizeStyle} />
      <InnerCircle color={color} isVisible={isVisible} style={sizeStyle} />
    </Root>
  );
});
