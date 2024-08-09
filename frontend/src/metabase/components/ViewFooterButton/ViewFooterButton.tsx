import { type Ref, forwardRef, type HTMLAttributes } from "react";

import {
  ActionIcon,
  Center,
  Icon,
  Tooltip,
  type ActionIconProps,
  type IconName,
} from "metabase/ui";

export type ViewFooterButtonProps = {
  icon: IconName;
  tooltipLabel?: string | null;
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

export const ViewFooterButton = forwardRef(function _ViewFooterButton(
  { icon, tooltipLabel, ...actionIconProps }: ViewFooterButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <Tooltip label={tooltipLabel}>
      <Center>
        <ActionIcon ref={ref} variant="viewFooter" {...actionIconProps}>
          <Icon size={18} name={icon} />
        </ActionIcon>
      </Center>
    </Tooltip>
  );
});
