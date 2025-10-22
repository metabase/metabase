import { useState } from "react";

import { useBenchLayoutContext } from "metabase/bench/context/BenchLayoutContext";
import { useBenchCurrentTab } from "metabase/bench/hooks/useBenchCurrentTab";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Menu,
  Text,
  UnstyledButton,
} from "metabase/ui";

import S from "./BenchAppBar.module.css";
import { BenchNavMenu, BenchNavTitleMenu } from "./BenchNavMenu";

export function BenchAppBar() {
  const metabot = PLUGIN_METABOT.useMetabotAgent();
  const currentTab = useBenchCurrentTab();
  const { onTogglePanel, isPanelCollapsed } = useBenchLayoutContext();
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [isTitleMenuOpen, setIsTitleMenuOpen] = useState(false);

  const hasPanelControl = onTogglePanel !== undefined;

  return (
    <Flex
      h={48}
      w="100%"
      className={S.appBar}
      align="center"
      justify="space-between"
      px="md"
    >
      <Group gap="md" wrap="nowrap">
        <BenchNavTitleMenu
          isOpen={isTitleMenuOpen}
          onToggle={() => setIsTitleMenuOpen(!isTitleMenuOpen)}
          onClose={() => setIsTitleMenuOpen(false)}
        />

        <Menu
          opened={isNavMenuOpen}
          onChange={setIsNavMenuOpen}
          position="bottom-start"
          shadow="md"
        >
          <Menu.Target>
            <UnstyledButton h={32} px="sm" miw={180} className={S.selectButton}>
              <Flex align="center" justify="space-between" h="100%">
                <Flex align="center" gap="xs">
                  <Icon name={currentTab.icon} size={16} />
                  <Text size="sm">{currentTab.label}</Text>
                </Flex>
                <Icon name="chevrondown" size={12} c="text-medium" />
              </Flex>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown p={0}>
            <BenchNavMenu onClose={() => setIsNavMenuOpen(false)} />
          </Menu.Dropdown>
        </Menu>

        {hasPanelControl && (
          <ActionIcon
            onClick={onTogglePanel}
            variant={!isPanelCollapsed ? "filled" : "subtle"}
          >
            <Icon
              name={!isPanelCollapsed ? "sidebar_open" : "sidebar_closed"}
            />
          </ActionIcon>
        )}
      </Group>

      <Group gap="xs">
        {metabot && (
          <ActionIcon
            variant={metabot.visible ? "filled" : "subtle"}
            onClick={() => metabot.setVisible(!metabot.visible)}
          >
            <Icon name="metabot" />
          </ActionIcon>
        )}
      </Group>
    </Flex>
  );
}
