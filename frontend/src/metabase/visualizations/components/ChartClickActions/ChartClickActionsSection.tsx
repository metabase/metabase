import React from "react";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
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

const Section = styled.div<{ type: string; direction?: ContentDirectionType }>`
  display: flex;

  ${({ type }) =>
    type === "sort" &&
    css`
      margin-bottom: 0.5rem;
    `}

  ${({ direction }) =>
    direction === "row"
      ? css`
          flex-direction: row;
        `
      : css`
          flex-direction: column;
          align-items: stretch;
        `}

  gap: 0.5rem;
`;

const SectionWithTitle = styled.div<{
  childrenDirection?: ContentDirectionType;
}>`
  display: flex;
  flex-direction: column;
  align-items: stretch;

  gap: ${({ childrenDirection }) =>
    childrenDirection === "row" ? `0.75rem` : `1rem`};

  margin: ${({ childrenDirection }) =>
    childrenDirection === "row" ? `0.5rem 0` : `0.5rem 0 0`};
`;

const SectionTitle = styled.p`
  margin: 0;

  font-size: 0.875em;
  color: ${color("text-medium")};
`;
