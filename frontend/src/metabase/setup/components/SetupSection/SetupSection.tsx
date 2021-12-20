import React, { ReactNode, useState } from "react";
import { t } from "ttag";
import {
  SectionRoot,
  SectionHeader,
  SectionContainer,
  SectionTitle,
  SectionDescription,
  SectionButton,
} from "./SetupSection.styled";

export interface Props {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

const SetupSection = ({ title, description, children }: Props): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <SectionRoot>
      <SectionHeader>
        <SectionContainer>
          <SectionTitle>{title}</SectionTitle>
          <SectionDescription>{description}</SectionDescription>
        </SectionContainer>
        <SectionButton
          round
          icon={isExpanded ? "chevronup" : "chevrondown"}
          aria-label={t`Setup section`}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
        />
      </SectionHeader>
      {isExpanded && children}
    </SectionRoot>
  );
};

export default SetupSection;
