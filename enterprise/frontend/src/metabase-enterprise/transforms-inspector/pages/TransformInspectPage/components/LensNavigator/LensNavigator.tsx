import type { PropsWithChildren } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  Box,
  Group,
  Icon,
  Loader,
  Stack,
  Tabs,
  Text,
  Tooltip,
  rem,
} from "metabase/ui";

import styles from "./LensNavigator.css";
import type { LensTab } from "./types";

type LensNavigatorProps = {
  tabs: LensTab[];
  activeTabKey: string | undefined;
  onSwitchTab: (tabKey: string) => void;
  onCloseTab: (tabKey: string) => void;
};

type IndicatorProps = {
  tab: LensTab;
  activeTabKey: string | undefined;
};

const Indicator = ({ tab, activeTabKey }: IndicatorProps) => {
  if (!tab.isStatic || tab.isFullyLoaded) {
    return null;
  }
  // Only the active tab is mounted and actually loading, so an unvisited
  // inactive tab would otherwise show a spinner forever.
  if (tab.key === activeTabKey) {
    return <Loader size="xs" data-testid="lens-tab-loader" />;
  }
  if (!tab.complexity || tab.complexity.level === "fast") {
    return null;
  }
  return (
    <Tooltip
      label={match(tab.complexity.level)
        .with("slow", () => t`This analysis may take longer to load`)
        .with(
          "very-slow",
          () => t`This analysis may take significantly longer to load`,
        )
        .exhaustive()}
    >
      <Icon name="clock" size={12} c="text-disabled" />
    </Tooltip>
  );
};

export const LensNavigator = ({
  tabs,
  activeTabKey,
  onSwitchTab,
  onCloseTab,
  children,
}: PropsWithChildren<LensNavigatorProps>) => {
  return (
    <Stack
      gap="0"
      bd="1px solid border-neutral"
      bdrs="sm"
      bg="background_page-primary"
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
                <Indicator tab={tab} activeTabKey={activeTabKey} />
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
                    <Icon name="close" size={16} c="text-disabled" />
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
};
