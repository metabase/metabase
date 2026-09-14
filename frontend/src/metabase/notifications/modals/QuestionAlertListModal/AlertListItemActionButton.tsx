import type { JSX, MouseEventHandler } from "react";

import { Button, Icon, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";
interface Props {
  label: string;
  iconName: IconName;
  onClick: MouseEventHandler;
}

export const AlertListItemActionButton = ({
  label,
  iconName,
  onClick,
}: Props): JSX.Element => (
  <Tooltip label={label}>
    {/* TODO: replace with ActionIcon (GDGT-2457) */}
    <Button
      variant="transparent"
      size="compact-md"
      aria-label={label}
      leftSection={<Icon c="icon-primary" name={iconName} />}
      onClick={onClick}
    />
  </Tooltip>
);
