import React from "react";

import Tooltip from "metabase/core/components/Tooltip";

import type { IconName } from "metabase/core/components/Icon";
import { Root, ShortMessage, StyledIcon } from "./ErrorView.styled";

interface ErrorViewProps {
  error: string;
  icon: IconName;
  isDashboard: boolean;
  isSmall: boolean;
}

function ErrorView({
  error,
  icon = "warning",
  isDashboard,
  isSmall,
}: ErrorViewProps) {
  return (
    <Root isDashboard={isDashboard}>
      <Tooltip tooltip={error} isEnabled={isSmall}>
        <StyledIcon name={icon} size={50} />
      </Tooltip>
      {!isSmall && <ShortMessage>{error}</ShortMessage>}
    </Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ErrorView;
