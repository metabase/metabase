import type { ReactNode } from "react";

import { type IconName, Tooltip } from "metabase/ui";

import { Root, ShortMessage, StyledIcon } from "./ErrorView.styled";

interface ErrorViewProps {
  error: ReactNode;
  icon?: IconName;
  isDashboard: boolean;
  isSmall: boolean;
}

export function ErrorView({
  error,
  icon = "warning",
  isDashboard,
  isSmall,
}: ErrorViewProps) {
  return (
    <Root isDashboard={isDashboard}>
      <Tooltip label={error} disabled={!isSmall}>
        <StyledIcon name={icon} size={50} />
      </Tooltip>
      {!isSmall && <ShortMessage>{error}</ShortMessage>}
    </Root>
  );
}
