import { type ReactNode, forwardRef } from "react";

import { type IconName, Tooltip } from "metabase/ui";

import { Root, ShortMessage, StyledIcon } from "./ErrorView.styled";

interface ErrorViewProps {
  error: ReactNode;
  icon?: IconName;
  isDashboard?: boolean;
  isSmall?: boolean;
}

export const ErrorView = forwardRef<HTMLDivElement, ErrorViewProps>(
  function ErrorView({ error, icon = "warning", isDashboard, isSmall }, ref) {
    return (
      <Root ref={ref} isDashboard={isDashboard}>
        <Tooltip label={error} disabled={!isSmall}>
          <StyledIcon name={icon} size={50} />
        </Tooltip>
        {!isSmall && <ShortMessage>{error}</ShortMessage>}
      </Root>
    );
  },
);
