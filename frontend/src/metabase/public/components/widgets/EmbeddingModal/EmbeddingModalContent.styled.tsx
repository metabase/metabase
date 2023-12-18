import styled from "@emotion/styled";
import type { ReactNode } from "react";
import { color } from "metabase/lib/colors";

const ContentWrapper = styled.div`
  width: 100%;
  display: flex;
  align-items: stretch;

  min-height: 648px;
`;

const SettingsAsideBlock = styled.div`
  flex-shrink: 0;
  width: 345px;
  padding: 2rem;
  border-right: 1px solid ${color("border")};
  background-color: ${color("white")};
`;

const PreviewAreaBlock = styled.div`
  width: 100%;
  min-width: 810px;

  padding: 0.5rem 1.5rem 2rem;
  background-color: ${color("bg-light")};
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
