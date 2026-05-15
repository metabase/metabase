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
    <Button
      color="brand"
      aria-label={label}
      leftSection={<Icon name={iconName} />}
      size="xs"
      variant="subtle"
      onClick={onClick}
    />
  </Tooltip>
);
