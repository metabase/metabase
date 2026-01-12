/* eslint-disable i18next/no-literal-string */
import cx from "classnames";
import { useState } from "react";

import wrenchImage from "assets/img/sdk-banner-wrench.svg";
import { DEFAULT_FONT } from "embedding-sdk-bundle/config";
import { useSdkDispatch } from "embedding-sdk-bundle/store";
import { setUsageProblem } from "embedding-sdk-bundle/store/reducer";
import type { SdkUsageProblem } from "embedding-sdk-bundle/types/usage-problem";
import ExternalLink from "metabase/common/components/ExternalLink";
import MetabaseLogo from "metabase/common/components/LogoIcon";
import { originalColors } from "metabase/lib/colors";
import { Button, Card, Flex, Icon, Popover, Stack, Text } from "metabase/ui";

import S from "./SdkUsageProblemBanner.module.css";

export interface SdkUsageProblemBannerProps {
  problem: SdkUsageProblem | null;
}

// Prevent the usage problem banner from inheriting the theme colors,
// so they remain legible even when the theme is changed.
const unthemedTextDark = originalColors["text-primary"];

export const SdkUsageProblemBanner = ({
  problem,
}: SdkUsageProblemBannerProps) => {
  const [expanded, setExpanded] = useState(false);
  const dispatch = useSdkDispatch();

  if (!problem) {
    return null;
  }

  const { title, severity } = problem;

  // When the font family cannot be loaded from the MB instance,
  // due to MB instance outage or missing CORS header,
  // we fall back to the system font.
  const fontFamily = `${DEFAULT_FONT}, sans-serif`;

  // eslint-disable-next-line no-literal-metabase-strings -- shown in development
  const pillTitle = "Metabase SDK";

  return (
    <Popover
      position="top-start"
      opened={expanded}
      onChange={setExpanded}
      // We don't want to render the popover within the portal,
      // as this is used within a fixed-position container in a portal.
      withinPortal={false}
    >
      <Popover.Target>
        <Flex
          onClick={() => setExpanded(!expanded)}
          className={cx(S.Indicator)}
          data-testid="sdk-usage-problem-indicator"
          i-should-be-flex="true"
        >
          <Flex bg="white" px="sm" className={S.Logo} align="center">
            <MetabaseLogo height={24} />
          </Flex>

          <Flex justify="center" align="center" className={S.Content}>
            <img src={wrenchImage} alt="wrench" />

            <Text ff={fontFamily} className={S.PillTitle} fw="bold" fz="xs">
              {pillTitle}
            </Text>
          </Flex>
        </Flex>
      </Popover.Target>

      <Popover.Dropdown className={S.PopoverDropdown}>
        <Card
          p="lg"
          radius="md"
          maw="22rem"
          data-testid="sdk-usage-problem-card"
        >
          <Stack gap="sm">
            <Flex w="100%" justify="space-between">
              <Text
                fw="bold"
                size="md"
                style={{ color: unthemedTextDark }}
                ff={fontFamily}
              >
                {title}
              </Text>
            </Flex>
            <Text style={{ color: unthemedTextDark }} ff={fontFamily} fz="sm">
              {problem.message}
            </Text>

            <Flex w="100%" justify="end" mt="sm" columnGap="sm">
              <Button
                fz="sm"
                ff={fontFamily}
                fs="normal"
                size="md"
                radius="md"
                variant="subtle"
                color="text-brand"
                onClick={() => {
                  dispatch(setUsageProblem(null));
                }}
              >
                Hide {severity === "error" ? "error" : "warning"}
              </Button>
              <ExternalLink role="link" href={problem.documentationUrl}>
                <Button
                  fz="sm"
                  rightSection={
                    <Icon aria-hidden name="external" size="1rem" />
                  }
                  ff={fontFamily}
                  className={S.DocsButton}
                  size="md"
                  radius="md"
                >
                  Documentation
                </Button>
              </ExternalLink>
            </Flex>
          </Stack>
        </Card>
      </Popover.Dropdown>
    </Popover>
  );
};
