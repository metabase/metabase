import React, { ReactNode, useState } from "react";
import { t } from "ttag";
import {
  SectionBody,
  SectionButton,
  SectionHeader,
  SectionRoot,
  SectionTitle,
} from "./SlackSection.styled";

export interface SlackSectionProps {
  title: string;
  children?: ReactNode;
}

const SlackSection = ({ title, children }: SlackSectionProps): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <SectionRoot>
      <SectionHeader onClick={() => setIsExpanded(!isExpanded)}>
        <SectionTitle>{title}</SectionTitle>
        <SectionButton
          round
          icon={isExpanded ? "chevronup" : "chevrondown"}
          aria-label={t`Setup section`}
          aria-expanded={isExpanded}
        />
      </SectionHeader>
      {isExpanded && <SectionBody>{children}</SectionBody>}
    </SectionRoot>
  );
};

export default SlackSection;
