import { type HTMLAttributes, type Ref, forwardRef } from "react";

import {
  ActionIcon,
  type ActionIconProps,
  Center,
  Icon,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";
export type ViewFooterButtonProps = {
  icon: IconName;
  tooltipLabel?: string | null;
  disableTooltip?: boolean;
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

export const ViewFooterButton = forwardRef(function _ViewFooterButton(
  {
    icon,
    tooltipLabel,
    disableTooltip,
    ...actionIconProps
  }: ViewFooterButtonProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Tooltip label={tooltipLabel} disabled={disableTooltip}>
      <Center ref={ref}>
        <ActionIcon variant="viewFooter" {...actionIconProps}>
          <Icon size={18} name={icon} />
        </ActionIcon>
      </Center>
    </Tooltip>
  );
});
