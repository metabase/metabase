import type { PropsWithChildren } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  Box,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
  Tooltip,
  UnstyledButton,
  rem,
} from "metabase/ui";

import styles from "./LensNavigator.css";
import type { LensTab } from "./types";

type LensNavigatorProps = {
  tabs: LensTab[];
  activeTabKey: string | null;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
};

export const LensNavigator = ({
  tabs,
  activeTabKey,
  onSwitchTab,
  onCloseTab,
  children,
}: PropsWithChildren<LensNavigatorProps>) => (
  <Stack gap="0" bd="1px solid border" bdrs="sm" bg="white" pt="0.375rem">
    <Tabs
      value={activeTabKey}
      onChange={(value) => value && onSwitchTab(value)}
      className={styles.tabs}
    >
      <Tabs.List px="lg" className={styles.tabsList}>
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.id} value={tab.id} className={styles.tab}>
            <Group gap="xs" wrap="nowrap">
              <Text
                size="md"
                fw={700}
                c={tab.id === activeTabKey ? "text-brand" : "text-primary"}
                truncate
                miw={0}
              >
                {tab.lensRef.title}
              </Text>
              {match(tab.complexity?.level)
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
                <UnstyledButton
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  aria-label={t`Close tab`}
                  ml={rem("2px")}
                  lh={1}
                >
                  <Icon name="close" size={16} c="text-tertiary" />
                </UnstyledButton>
              )}
            </Group>
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
    <Box p="lg">{children}</Box>
  </Stack>
);
