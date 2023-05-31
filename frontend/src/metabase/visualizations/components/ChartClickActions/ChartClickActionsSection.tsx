import React from "react";
import {
  Section,
  SectionTitle,
  SectionWithTitle,
} from "metabase/visualizations/components/ChartClickActions/ChartClickActionsSection.styled";
import { ContentDirectionType } from "./utils";

interface Props {
  type: string;

  title?: string | null;
  contentDirection?: ContentDirectionType;

  children: React.ReactNode;
}

const testId = "drill-through-section";

export const ChartClickActionsSection = ({
  type,
  title,
  contentDirection = "column",
  children,
}: Props): JSX.Element => {
  if (title) {
    return (
      <SectionWithTitle
        childrenDirection={contentDirection}
        data-testid={testId}
      >
        <SectionTitle>{title}</SectionTitle>
        <Section type={type} direction={contentDirection}>
          {children}
        </Section>
      </SectionWithTitle>
    );
  }

  return (
    <Section type={type} direction={contentDirection} data-testid={testId}>
      {children}
    </Section>
  );
};
