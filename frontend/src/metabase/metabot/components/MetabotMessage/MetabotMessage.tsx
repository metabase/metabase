import React, { ReactNode } from "react";
import { MetabotVariant } from "metabase/core/components/MetabotLogo/MetabotLogo";
import {
  MetabotText,
  MetabotIcon,
  MetabotMessageRoot,
} from "./MetabotMessage.styled";

interface MetabotMessageProps {
  children?: ReactNode;
  metabotVariant?: MetabotVariant;
}

const MetabotMessage = ({ children, metabotVariant }: MetabotMessageProps) => {
  return (
    <MetabotMessageRoot>
      <MetabotIcon variant={metabotVariant} />
      <MetabotText>{children}</MetabotText>
    </MetabotMessageRoot>
  );
};

export default MetabotMessage;
