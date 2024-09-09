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

export function LegendItemDot({
  isVisible = true,
  color,
  onClick,
}: LegendItemDotProps) {
  if (onClick) {
    return (
      <RootButton
        aria-label={isVisible ? t`Hide series` : t`Show series`}
        onClick={onClick}
      >
        <OuterCircle />
        <InnerCircle color={color} isVisible={isVisible} />
      </RootButton>
    );
  }

  return (
    <Root data-testid="legend-item-dot">
      <OuterCircle />
      <InnerCircle color={color} isVisible={isVisible} />
    </Root>
  );
}
