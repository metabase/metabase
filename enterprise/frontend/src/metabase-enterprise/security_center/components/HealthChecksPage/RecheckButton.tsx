import type { ReactNode } from "react";

import { Button, type ButtonProps, Icon, Loader } from "metabase/ui";

type RecheckButtonProps = {
  variant?: ButtonProps["variant"];
  isRechecking: boolean;
  isDisabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

export const RecheckButton = ({
  variant,
  isRechecking,
  isDisabled,
  onClick,
  children,
}: RecheckButtonProps) => (
  <Button
    variant={variant}
    leftSection={isRechecking ? <Loader size="1rem" /> : <Icon name="sync" />}
    disabled={isRechecking || isDisabled}
    onClick={onClick}
  >
    {children}
  </Button>
);
