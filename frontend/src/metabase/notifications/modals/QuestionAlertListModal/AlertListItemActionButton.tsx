import type { JSX, MouseEventHandler } from "react";

import type { IconName } from "metabase-types/api";
import { Button, Icon, Tooltip } from "metabase/ui";
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
      color="core-brand"
      aria-label={label}
      leftSection={<Icon name={iconName} />}
      size="xs"
      variant="subtle"
      onClick={onClick}
    />
  </Tooltip>
);
