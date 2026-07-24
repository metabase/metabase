import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon } from "metabase/ui";

import {
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionRoot,
  SectionTitle,
} from "./SetupSection.styled";

interface SetupSectionProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
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
        <ActionIcon
          variant="default"
          radius="xl"
          size="2.5rem"
          aria-label={t`Setup section`}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Icon
            name={isExpanded ? "chevronup" : "chevrondown"}
            c="core-brand"
          />
        </ActionIcon>
      </SectionHeader>
      {isExpanded && children}
    </SectionRoot>
  );
};
