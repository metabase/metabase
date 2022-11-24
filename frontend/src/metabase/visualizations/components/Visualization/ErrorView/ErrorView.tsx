import React from "react";

import Tooltip from "metabase/components/Tooltip";

import { Root, ShortMessage, StyledIcon } from "./ErrorView.styled";

interface Props {
  error: string;
  icon: string;
  isDashboard: boolean;
  isSmall: boolean;
}

function ErrorView({ error, icon = "warning", isDashboard, isSmall }: Props) {
  return (
    <Root isDashboard={isDashboard}>
      <Tooltip tooltip={error} isEnabled={isSmall}>
        <StyledIcon name={icon} size={50} />
      </Tooltip>
      {!isSmall && <ShortMessage>{error}</ShortMessage>}
    </Root>
  );
}

export default ErrorView;
