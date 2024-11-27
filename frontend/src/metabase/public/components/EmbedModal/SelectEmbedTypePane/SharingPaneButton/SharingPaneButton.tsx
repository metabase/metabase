import cx from "classnames";
import type { MouseEventHandler, ReactNode } from "react";
import { t } from "ttag";

import {
  Box,
  Center,
  Flex,
  Group,
  Icon,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";

import S from "./SharingPaneButton.module.css";

type SharingOptionProps = {
  illustration: JSX.Element;
  children: ReactNode;
  title: string;
  badge?: ReactNode;
  onClick?: MouseEventHandler;
  "data-testid"?: string;
  isDisabled?: boolean;
};

export const SharingPaneButton = ({
  illustration,
  children,
  title,
  onClick,
  badge,
  "data-testid": dataTestId,
  isDisabled,
}: SharingOptionProps) => {
  return (
    <Paper
      className={cx(S.Container, { [S.Disabled]: isDisabled })}
      p={24}
      pt={52}
      withBorder
      data-testid={dataTestId}
      onClick={onClick}
      mih="100%"
      pos="relative"
      w={"22rem"}
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
            <Flex align="center" justify="center">
              {t`Disabled`}
              <Tooltip
                maw="20rem"
                multiline
                label={t`This option was disabled by an admin`}
              >
                <Icon name="info_filled" ml="xs" />
              </Tooltip>
            </Flex>
          </Text>
        </Box>
      )}
    </Paper>
  );
};
