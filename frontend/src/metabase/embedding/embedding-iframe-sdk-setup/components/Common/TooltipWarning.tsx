import type { ReactNode } from "react";
import { P, match } from "ts-pattern";

import CS from "metabase/css/core/index.css";
import { Flex, HoverCard, Icon, Tooltip } from "metabase/ui";

export type TooltipWarningMode = "default" | "custom";

type TooltipWarningProps = {
  mode?: TooltipWarningMode;
  children: (data: {
    disabled: boolean;
    hoverCard: ReactNode | null;
  }) => ReactNode;
  enableTooltip?: boolean;
  icon?: ReactNode;
  disabled: boolean;
} & (
  | {
      tooltip: string;
      hovercard?: never;
    }
  | {
      tooltip?: never;
      hovercard: ReactNode;
    }
);

export const TooltipWarning = ({
  children,
  mode = "default",
  enableTooltip = true,
  icon,
  tooltip,
  hovercard,
  disabled,
}: TooltipWarningProps) => {
  if (!enableTooltip) {
    return children({ disabled: false, hoverCard: null });
  }

  const iconElement = icon ?? (
    <Icon
      name={"info"}
      size={14}
      c="text-secondary"
      cursor="pointer"
      style={{ flexShrink: 0 }}
    />
  );
  const hoverCard = disabled
    ? match({ tooltip, hovercard })
        .with({ tooltip: P.not(P.nullish) }, ({ tooltip }) => (
          <Tooltip label={tooltip}>{iconElement}</Tooltip>
        ))
        .with({ hovercard: P.not(P.nullish) }, ({ hovercard }) => (
          <HoverCard position="bottom">
            <HoverCard.Target>
              <Flex align="center" className={CS.cursorPointer}>
                {iconElement}
              </Flex>
            </HoverCard.Target>
            <HoverCard.Dropdown>{hovercard}</HoverCard.Dropdown>
          </HoverCard>
        ))
        .otherwise(() => null)
    : null;

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
