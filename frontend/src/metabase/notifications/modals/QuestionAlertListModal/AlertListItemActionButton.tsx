import type { JSX, MouseEventHandler } from "react";

import { Button, Icon, type IconName, Tooltip } from "metabase/ui";

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
      leftIcon={<Icon name={iconName} />}
      mr="-0.6875rem"
      size="xs"
      variant="subtle"
      onClick={onClick}
    />
  </Tooltip>
);
