import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Box, Flex, HoverCard, Icon } from "metabase/ui";

export type TooltipWarningMode = "default" | "custom";

export const TooltipWarning = ({
  children,
  mode = "default",
  enableTooltip = true,
  icon,
  warning,
  disabled,
}: {
  mode?: TooltipWarningMode;
  children: (data: {
    disabled: boolean;
    hoverCard: ReactNode | null;
  }) => ReactNode;
  enableTooltip?: boolean;
  icon?: ReactNode;
  warning: ReactNode;
  disabled: boolean;
}) => {
  if (!enableTooltip) {
    return children({ disabled: false, hoverCard: null });
  }

  const iconElement = (
    <Box>
      {icon ?? (
        <Icon
          name={"info"}
          size={14}
          c="text-medium"
          cursor="pointer"
          style={{ flexShrink: 0 }}
        />
      )}
    </Box>
  );
  const hoverCard = disabled ? (
    <HoverCard position="bottom">
      <HoverCard.Target>
        <Box className={CS.cursorPointer}>{iconElement}</Box>
      </HoverCard.Target>
      <HoverCard.Dropdown>{warning}</HoverCard.Dropdown>
    </HoverCard>
  ) : null;

  const isCustomMode = mode === "custom";

  if (isCustomMode) {
    return children({
      disabled,
      hoverCard,
    });
  }

  return (
    <Flex align="center" gap="xs" data-testid="tooltip-warning">
      {children({
        disabled,
        hoverCard: null,
      })}

      {hoverCard}
    </Flex>
  );
};
