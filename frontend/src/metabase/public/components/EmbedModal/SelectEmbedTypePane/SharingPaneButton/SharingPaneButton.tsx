import cx from "classnames";
import type { MouseEventHandler, ReactNode } from "react";
import { t } from "ttag";

import Link from "metabase/core/components/Link";
import { Box, Center, Group, Paper, Stack, Text, Title } from "metabase/ui";

import S from "./SharingPaneButton.module.css";

type SharingOptionProps = {
  illustration: JSX.Element;
  children: ReactNode;
  title: string;
  badge?: ReactNode;
  onClick?: MouseEventHandler;
  "data-testid"?: string;
  isDisabled?: boolean;
  disabledLink: string;
};

export const SharingPaneButton = ({
  illustration,
  children,
  title,
  onClick,
  badge,
  "data-testid": dataTestId,
  isDisabled,
  disabledLink,
}: SharingOptionProps) => {
  return (
    <Paper
      component="article"
      className={cx(S.Container, { [S.Disabled]: isDisabled })}
      p="lg"
      pt="3.25rem"
      withBorder
      data-testid={dataTestId}
      onClick={onClick}
      mih="100%"
      pos="relative"
      w="22rem"
      aria-label={title}
    >
      <Stack pb={isDisabled ? "md" : undefined}>
        <Center mb={32}>{illustration}</Center>
        <Group align="center" spacing="sm">
          <Title size="h2">{title}</Title>
          {badge}
        </Group>
        {children}
      </Stack>
      {isDisabled && (
        <Box
          pos="absolute"
          bottom={0}
          left={0}
          w="100%"
          bg="var(--mb-color-background-disabled)"
        >
          <Text
            c="var(--mb-color-text-secondary)"
            weight="bold"
            align="center"
            py="sm"
            lh="1"
          >
            {t`Disabled.`}
            <Box
              ml="xs"
              component={Link}
              variant="brand"
              to={disabledLink}
            >{t`Enable in admin settings`}</Box>
          </Text>
        </Box>
      )}
    </Paper>
  );
};
