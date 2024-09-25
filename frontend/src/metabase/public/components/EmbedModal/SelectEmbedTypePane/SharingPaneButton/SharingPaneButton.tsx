import type { MouseEventHandler, ReactNode } from "react";

import { Box, Center, Group, Icon, Paper, Stack, Title } from "metabase/ui";

import S from "./SharingPaneButton.module.css";

type SharingOptionProps = {
  illustration: JSX.Element;
  children: ReactNode;
  title: string;
  badge?: ReactNode;
  onClick?: MouseEventHandler;
  "data-testid"?: string;
  externalLink?: boolean;
};

export const SharingPaneButton = ({
  illustration,
  children,
  title,
  onClick,
  badge,
  externalLink = false,
  "data-testid": dataTestId,
}: SharingOptionProps) => (
  <Paper
    className={S.Container}
    p={24}
    pt={52}
    withBorder
    data-testid={dataTestId}
    onClick={onClick}
    h="100%"
    pos="relative"
  >
    <Stack>
      {externalLink && (
        <Box pos="absolute" top={12} right={12}>
          <Icon name="share" color="var(--external-link-icon-color)" />
        </Box>
      )}
      <Center mb={32}>{illustration}</Center>
      <Group align="center" spacing="sm">
        <Title size="h2">{title}</Title>
        {badge}
      </Group>
      {children}
    </Stack>
  </Paper>
);
