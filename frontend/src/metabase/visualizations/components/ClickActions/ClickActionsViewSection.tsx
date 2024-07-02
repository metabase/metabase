import type * as React from "react";

import {
  Section,
  SectionTitle,
  SectionWithTitle,
} from "./ClickActionsViewSection.styled";
import type { ContentDirectionType } from "./utils";

interface Props {
  type: string;

  title?: string | null;
  contentDirection?: ContentDirectionType;

  children: React.ReactNode;
}

export const ClickActionsViewSection = ({
  type,
  title,
  contentDirection = "column",
  children,
}: Props): JSX.Element => {
  if (title) {
    return (
      <SectionWithTitle childrenDirection={contentDirection}>
        <SectionTitle>{title}</SectionTitle>
        <Section type={type} direction={contentDirection}>
          {children}
        </Section>
      </SectionWithTitle>
    );
  }

  return (
    <Section type={type} direction={contentDirection}>
      {children}
    </Section>
  );
};
