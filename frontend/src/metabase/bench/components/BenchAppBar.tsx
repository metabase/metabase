import { useEffect, useState } from "react";
import { t } from "ttag";

import { useBenchLayoutContext } from "metabase/bench/context/BenchLayoutContext";
import { useBenchCurrentTab } from "metabase/bench/hooks/useBenchCurrentTab";
import { ProfileLink } from "metabase/nav/components/ProfileLink";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  Flex,
  Group,
  Icon,
  Menu,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

import { useRememberBenchTab } from "../hooks/useBenchRememberTab";

import S from "./BenchAppBar.module.css";
import { BenchNavMenu, BenchNavTitleMenu } from "./BenchNavMenu";

export function BenchAppBar() {
  const currentTab = useBenchCurrentTab();
  const { setTab } = useRememberBenchTab();
  const { onTogglePanel, isPanelCollapsed } = useBenchLayoutContext();
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  useEffect(() => setTab(currentTab.id), [currentTab.id, setTab]);

  const hasPanelControl = onTogglePanel !== undefined;

  return (
    <Flex
      h={52}
      w="100%"
      className={S.appBar}
      align="center"
      justify="space-between"
      pl="1.325rem"
      pr="md"
    >
      <Group gap={0} wrap="nowrap">
        {hasPanelControl && (
          <Tooltip
            label={isPanelCollapsed ? t`Open sidebar` : t`Close sidebar`}
          >
            <UnstyledButton
              w={36}
              h="100%"
              display="flex"
              onClick={onTogglePanel}
              className={S.toggleButton}
              aria-label={t`Toggle sidebar`}
            >
              <Icon size={20} name="burger" className={S.toggleIcon} />
            </UnstyledButton>
          </Tooltip>
        )}

        <BenchNavTitleMenu />

        <Menu
          opened={isNavMenuOpen}
          onChange={setIsNavMenuOpen}
          position="bottom"
          shadow="md"
          offset={16}
          withinPortal
          middlewares={{
            shift: { padding: { top: 16, right: 4, bottom: 16, left: 4 } },
            size: {
              apply({ availableHeight, elements }) {
                Object.assign(elements.floating.style, {
                  height: `${availableHeight}px`,
                  overflowY: "auto",
                });
              },
              padding: { top: 16, right: 4, bottom: 16, left: 4 },
            },
          }}
        >
          <Menu.Target>
            <UnstyledButton
              data-testid="bench-nav-menu-button"
              h={32}
              px="sm"
              className={S.selectButton}
            >
              <Flex align="center" justify="space-between" h="100%" gap="xs">
                <Text size="md" fw={700}>
                  {currentTab.getLabel()}
                </Text>
                <Icon name="chevron_dual" size={20} />
              </Flex>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown p={0}>
            <BenchNavMenu onClose={() => setIsNavMenuOpen(false)} />
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Group gap="sm">
        <PLUGIN_METABOT.MetabotAppBarButton />
        <ProfileLink excludeItems={["workbench"]} />
      </Group>
    </Flex>
  );
}
