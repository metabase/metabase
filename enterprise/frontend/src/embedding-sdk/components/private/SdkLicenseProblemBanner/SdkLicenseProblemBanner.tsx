import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";

import { SDK_SSO_DOCS_LINK } from "embedding-sdk/lib/license-problem";
import type { SdkLicenseProblem } from "embedding-sdk/types/license-problem";
import LogoIcon from "metabase/components/LogoIcon";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Button, Card, Flex, Icon, Popover, Stack, Text } from "metabase/ui";

import S from "./SdkLicenseProblemBanner.module.css";

interface Props {
  problem: SdkLicenseProblem | null;
}

export const SdkLicenseProblemBanner = ({ problem }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [shown, { close: hideBanner }] = useDisclosure(true);

  if (!problem || !shown) {
    return null;
  }

  const { severity } = problem;
  const isError = severity === "error";

  return (
    <Popover position="top-start" opened={expanded} onChange={setExpanded}>
      <Popover.Target>
        <Flex
          onClick={() => setExpanded(!expanded)}
          className={cx(S.Banner, isError ? S.Error : S.Warning)}
        >
          <Flex bg="white" px="sm" py="xs" className={S.Logo}>
            <LogoIcon height={24} />
          </Flex>

          <Flex
            justify="center"
            align="center"
            px="9px"
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
      </Popover.Target>

      <Popover.Dropdown className={S.PopoverDropdown}>
        <Card p="md" radius="md" c="text-dark" maw="20rem">
          <Stack spacing="sm">
            <Flex w="100%" justify="space-between">
              <Text fw="bold" size="lg" transform="capitalize">
                {severity}
              </Text>

              <Icon
                name="chevrondown"
                size={16}
                onClick={() => setExpanded(false)}
                cursor="pointer"
              />
            </Flex>

            <Text>{problem.message}</Text>

            <Flex w="100%" justify="end" mt="sm" columnGap="sm">
              <Button fz="sm" variant="subtle" onClick={hideBanner} compact>
                Hide {severity}
              </Button>

              <ExternalLink href={SDK_SSO_DOCS_LINK}>
                <Button
                  fz="sm"
                  variant="outline"
                  rightIcon={<Icon name="external" size={10} />}
                  compact
                >
                  View documentation
                </Button>
              </ExternalLink>
            </Flex>
          </Stack>
        </Card>
      </Popover.Dropdown>
    </Popover>
  );
};
