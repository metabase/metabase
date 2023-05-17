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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetabotMessage;
