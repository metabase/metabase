import { type HTMLAttributes, type Ref, forwardRef } from "react";

import {
  ActionIcon,
  type ActionIconProps,
  Center,
  Icon,
  type IconName,
  Tooltip,
} from "metabase/ui";

export type ViewFooterButtonProps = {
  icon: IconName;
  tooltipLabel?: string | null;
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

export const ViewFooterButton = forwardRef(function _ViewFooterButton(
  { icon, tooltipLabel, ...actionIconProps }: ViewFooterButtonProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Tooltip label={tooltipLabel}>
      <Center ref={ref}>
        <ActionIcon variant="viewFooter" {...actionIconProps}>
          <Icon size={18} name={icon} />
        </ActionIcon>
      </Center>
    </Tooltip>
  );
});
