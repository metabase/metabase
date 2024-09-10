import cx from "classnames";

import type { SdkLicenseProblem } from "embedding-sdk/types/license-problem";
import LogoIcon from "metabase/components/LogoIcon";
import { Box, Card, Flex, HoverCard, Icon, Stack, Text } from "metabase/ui";

import S from "./SdkLicenseProblemBanner.module.css";

interface Props {
  problem: SdkLicenseProblem | null;
}

export const SdkLicenseProblemBanner = ({ problem }: Props) => {
  if (!problem) {
    return null;
  }

  const { severity } = problem;
  const isError = severity === "error";

  return (
    <HoverCard position="top-start">
      <HoverCard.Target>
        <Flex className={cx(S.Banner, isError ? S.Error : S.Warning)}>
          <Flex bg="white" px="sm" py="xs" className={S.Logo}>
            <LogoIcon height={24} />
          </Flex>

          <Flex
            justify="center"
            align="center"
            px="sm"
            columnGap="sm"
            className={S.Content}
          >
            <Icon
              name={isError ? "warning_round_filled" : "warning"}
              size={14}
              fill="var(--mb-color-text-dark)"
            />

            <Text transform="capitalize" c="text-medium">
              {severity}
            </Text>
          </Flex>
        </Flex>
      </HoverCard.Target>

      <HoverCard.Dropdown>
        <Box maw="20rem">
          <Card p="md" radius="md" c="text-dark">
            <Stack spacing="sm">
              <Text fw="bold" size="lg" transform="capitalize">
                {severity}
              </Text>

              <Text>{problem.message}</Text>
            </Stack>
          </Card>
        </Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};
