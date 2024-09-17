import styled from "@emotion/styled";
import type { ComponentProps, MouseEventHandler, ReactNode } from "react";

import {
  Box,
  Center,
  Group,
  Icon,
  Paper,
  type PaperProps,
  Stack,
  Title,
} from "metabase/ui";

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
  <Container
    p={24}
    pt={52}
    withBorder
    data-testid={dataTestId}
    onClick={onClick}
    h="100%"
    pos="relative"
    style={{ cursor: "pointer" }}
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
  </Container>
);

const Container = styled(Paper)<PaperProps & ComponentProps<"div">>`
  cursor: pointer;
  border-color: var(--mb-color-brand-light);
  --external-link-icon-color: var(--mb-color-text-light);

  &:hover {
    border-color: var(--mb-base-color-blue-40);
    background-color: var(--mb-color-bg-light);
    --external-link-icon-color: var(--mb-base-color-blue-40);
  }
`;
