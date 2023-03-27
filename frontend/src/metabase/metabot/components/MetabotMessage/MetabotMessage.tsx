import React, { ReactNode } from "react";
import {
  MetabotText,
  MetabotIcon,
  MetabotMessageRoot,
} from "./MetabotMessage.styled";

interface MetabotMessageProps {
  children?: ReactNode;
}

const MetabotMessage = ({ children }: MetabotMessageProps) => {
  return (
    <MetabotMessageRoot>
      <MetabotIcon />
      <MetabotText>{children}</MetabotText>
    </MetabotMessageRoot>
  );
};

export default MetabotMessage;
