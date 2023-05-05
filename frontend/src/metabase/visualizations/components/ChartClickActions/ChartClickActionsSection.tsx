import React from "react";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

interface Props {
  title?: string | null;
  withDivider?: boolean;

  children: React.ReactNode;
}

const ChartClickActionsSection = ({
  title,
  withDivider,
  children,
}: Props): JSX.Element => {
  if (title) {
    return (
      <SectionWithTitle data-testid="drill-through-section">
        <SectionTitle>{title}</SectionTitle>
        <div>{children}</div>
      </SectionWithTitle>
    );
  }

  return (
    <Section data-testid="drill-through-section">
      {children}
      {withDivider && <Divider />}
    </Section>
  );
};

export default ChartClickActionsSection;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;

  gap: 0.5rem;

  &:not(:last-child):not(:first-child) {
    padding-bottom: 1rem;
  }
`;

const SectionWithTitle = styled(Section)`
  padding-left: 0.5rem;
`;

const SectionTitle = styled.p`
  margin: 0;

  font-size: 0.875em;
  color: ${color("text-medium")};
`;

export const Divider = styled.div`
  height: 1px;
  background-color: ${color("border")};
  margin: 1rem -1.5rem 1rem;
`;
