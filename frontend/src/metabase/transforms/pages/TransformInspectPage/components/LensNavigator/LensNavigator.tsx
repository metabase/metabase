import type { PropsWithChildren } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Box, Group, Icon, Stack, Tabs, Text, Tooltip, rem } from "metabase/ui";

import styles from "./LensNavigator.css";
import type { LensTab } from "./types";

type LensNavigatorProps = {
  tabs: LensTab[];
  activeTabKey: string | undefined;
  onSwitchTab: (tabKey: string) => void;
  onCloseTab: (tabKey: string) => void;
};

export const LensNavigator = ({
  tabs,
  activeTabKey,
  onSwitchTab,
  onCloseTab,
  children,
}: PropsWithChildren<LensNavigatorProps>) => (
  <Stack
    gap="0"
    bd="1px solid border"
    bdrs="sm"
    bg="background-primary"
    pt={rem(6)}
  >
    <Tabs
      value={activeTabKey}
      onChange={(value) => value && onSwitchTab(value)}
      className={styles.tabs}
    >
      <Tabs.List px="lg" className={styles.tabsList}>
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.key} value={tab.key} className={styles.tab}>
            <Group gap="xs" wrap="nowrap">
              <Text
                size="md"
                fw={700}
                c={tab.key === activeTabKey ? "text-brand" : "text-primary"}
                truncate
                miw={0}
              >
                {tab.title ?? t`Loading...`}
              </Text>
              {tab.isStatic &&
                !tab.isFullyLoaded &&
                match(tab.complexity?.level)
                  .with("slow", "very-slow", (level) => (
                    <Tooltip
                      label={match(level)
                        .with(
                          "slow",
                          () => t`This analysis may take longer to load`,
                        )
                        .with(
                          "very-slow",
                          () =>
                            t`This analysis may take significantly longer to load`,
                        )
                        .exhaustive()}
                    >
                      <Icon name="clock" size={12} c="text-tertiary" />
                    </Tooltip>
                  ))
                  .otherwise(() => null)}
              {!tab.isStatic && (
                <Box
                  component="span"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.key);
                  }}
                  role="button"
                  aria-label={t`Close tab`}
                  ml={rem("2px")}
                  lh={1}
                  style={{ cursor: "pointer" }}
                >
                  <Icon name="close" size={16} c="text-tertiary" />
                </Box>
              )}
            </Group>
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
    <Box p="lg">{children}</Box>
  </Stack>
);
