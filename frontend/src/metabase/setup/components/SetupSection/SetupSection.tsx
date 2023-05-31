import { ReactNode, useState } from "react";
import { t } from "ttag";
import {
  SectionRoot,
  SectionHeader,
  SectionContainer,
  SectionTitle,
  SectionDescription,
  SectionButton,
} from "./SetupSection.styled";

export interface SetupSectionProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

const SetupSection = ({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SetupSection;
