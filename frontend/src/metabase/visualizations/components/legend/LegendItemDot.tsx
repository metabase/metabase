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
  onClick?: () => void;
}

export const LegendItemDot = forwardRef<
  HTMLButtonElement | HTMLDivElement,
  LegendItemDotProps
>(function LegendItemDot({ isVisible = true, color, onClick }, ref) {
  if (onClick) {
    return (
      <RootButton
        aria-label={isVisible ? t`Hide series` : t`Show series`}
        onClick={onClick}
        ref={ref as Ref<HTMLButtonElement>}
      >
        <OuterCircle />
        <InnerCircle color={color} isVisible={isVisible} />
      </RootButton>
    );
  }

  return (
    <Root data-testid="legend-item-dot" ref={ref as Ref<HTMLDivElement>}>
      <OuterCircle />
      <InnerCircle color={color} isVisible={isVisible} />
    </Root>
  );
});
