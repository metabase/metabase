import styled from "@emotion/styled";
import type { ReactNode } from "react";
import { color } from "metabase/lib/colors";
import { Box, Center, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

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

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: stretch;

  gap: 1rem;

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

export const CodePreviewControlOptions = [
  {
    label: (
      <Center>
        <Icon name="embed" />
        <Box ml="0.5rem">Code</Box>
      </Center>
    ),
    value: "code",
  },
  {
    label: (
      <Center>
        <Icon name="eye_filled" />
        <Box ml="0.5rem">Preview</Box>
      </Center>
    ),
    value: "preview",
  },
];

export const DisplayOptionSection = ({
  title,
  titleId,
  children,
}: {
  title: string;
  titleId?: string;
  children: React.ReactNode;
}) => (
  <div>
    <Text fw="bold" mb="0.25rem" lh="1rem" id={titleId}>
      {title}
    </Text>
    {children}
  </div>
);
