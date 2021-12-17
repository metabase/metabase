import React, { ReactNode, useState } from "react";
import Button from "metabase/components/Button";
import {
  SectionRoot,
  SectionHeader,
  SectionContainer,
  SectionTitle,
  SectionDescription,
} from "./SetupSection.styled";

export interface Props {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

const SetupSection = ({ title, description, children }: Props): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <SectionRoot>
      <SectionHeader>
        <SectionContainer>
          <SectionTitle>{title}</SectionTitle>
          <SectionDescription>{description}</SectionDescription>
        </SectionContainer>
        <Button round icon="chevrondown" onClick={handleClick} />
      </SectionHeader>
      {children}
    </SectionRoot>
  );
};

export default SetupSection;
