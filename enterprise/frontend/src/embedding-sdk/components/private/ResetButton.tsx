import type React from "react";

import { Button, Icon } from "metabase/ui";

interface ResetButtonProps {
  className?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ResetButton = ({
  className,
  onClick,
}: ResetButtonProps): React.JSX.Element => (
  <Button
    className={className}
    variant="default"
    radius="xl"
    leftIcon={<Icon name="revert" />}
    onClick={onClick}
  />
);
