import { t } from "ttag";

import { Button, InnerCircle, OuterCircle } from "./LegendItemDot.styled";

interface LegendItemDotProps {
  isVisible: boolean;
  color: string;
  onClick: () => void;
}

export function LegendItemDot({
  isVisible = true,
  color,
  onClick,
}: LegendItemDotProps) {
  return (
    <Button
      aria-label={isVisible ? t`Hide series` : t`Show series`}
      onClick={onClick}
    >
      <OuterCircle />
      <InnerCircle color={color} isVisible={isVisible} />
    </Button>
  );
}
