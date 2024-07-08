import styled from "@emotion/styled";
import type { ReactNode } from "react";

import { Text } from "metabase/ui";

const ContentWrapper = styled.div`
  width: 100%;
  display: flex;
  align-items: stretch;
  min-height: 648px;
`;

const SettingsAsideBlock = styled.div`
  flex-shrink: 0;
  width: 21.6rem;
  padding: 2rem;
  border-right: 1px solid ${({ theme }) => theme.fn.themeColor("border")};
  background-color: ${({ theme }) => theme.fn.themeColor("white")};
  height: 45.125rem;
  overflow-y: auto;
`;

const PreviewAreaBlock = styled.div`
  width: 100%;
  min-width: 50rem;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: stretch;
  gap: 1rem;
  padding: 1rem 1.5rem 2rem 1rem;
  background-color: ${({ theme }) => theme.fn.themeColor("bg-light")};
`;

export const SettingsTabLayout = ({
  settingsSlot,
  previewSlot,
}: {
  settingsSlot: ReactNode;
  previewSlot: ReactNode;
}): JSX.Element => {
  return (
    <ContentWrapper>
      <SettingsAsideBlock>{settingsSlot}</SettingsAsideBlock>
      <PreviewAreaBlock>{previewSlot}</PreviewAreaBlock>
    </ContentWrapper>
  );
};

export const DisplayOptionSection = ({
  title,
  titleId,
  children,
}: {
  title: string;
  titleId?: string;
  children: ReactNode;
}) => (
  <div>
    <Text fw="bold" mb="0.25rem" lh="1rem" id={titleId}>
      {title}
    </Text>
    {children}
  </div>
);
