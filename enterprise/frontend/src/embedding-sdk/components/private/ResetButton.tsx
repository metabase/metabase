import type React from "react";
import { t } from "ttag";

import { Button, Icon, Tooltip } from "metabase/ui";

const sizeOverrideStyles = {
  width: 32,
  height: 32,
};

interface ResetButtonProps {
  className?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ResetButton = ({
  className,
  onClick,
}: ResetButtonProps): React.JSX.Element => (
  <Tooltip label={t`Reset view`}>
    <Button
      className={className}
      variant="outline"
      radius="xl"
      size="xs"
      leftIcon={<Icon name="revert" />}
      style={sizeOverrideStyles}
      onClick={onClick}
    />
  </Tooltip>
);
