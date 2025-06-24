import { useState } from "react";
import { t } from "ttag";

import {
  SectionButton,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionRoot,
  SectionTitle,
} from "./SetupSection.styled";

interface SetupSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}

export const SetupSection = ({
  title,
  description,
  children,
}: SetupSectionProps): JSX.Element => {
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
