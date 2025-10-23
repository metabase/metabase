import { useEffect, useState } from "react";

import { useBenchLayoutContext } from "metabase/bench/context/BenchLayoutContext";
import { useBenchCurrentTab } from "metabase/bench/hooks/useBenchCurrentTab";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  ActionIcon,
  Flex,
  Group,
  Icon,
  Menu,
  Text,
  UnstyledButton,
} from "metabase/ui";

import { useRememberBenchTab } from "../hooks/useBenchRememberTab";

import S from "./BenchAppBar.module.css";
import { BenchNavMenu, BenchNavTitleMenu } from "./BenchNavMenu";

export function BenchAppBar() {
  const metabot = PLUGIN_METABOT.useMetabotAgent();
  const currentTab = useBenchCurrentTab();
  const { getTab, setTab } = useRememberBenchTab();
  const { onTogglePanel } = useBenchLayoutContext();
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(() => !getTab());
  const [isTitleMenuOpen, setIsTitleMenuOpen] = useState(false);
  useEffect(() => setTab(currentTab.id), [currentTab.id, setTab]);

  const hasPanelControl = onTogglePanel !== undefined;

  return (
    <Flex
      h={52}
      w="100%"
      className={S.appBar}
      align="center"
      justify="space-between"
      px="md"
    >
      <Group gap="sm" wrap="nowrap">
        {hasPanelControl && (
          <UnstyledButton
            w={36}
            h="100%"
            display="flex"
            style={{
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={onTogglePanel}
            className={S.toggleButton}
          >
            <Icon
              size={20}
              name="burger"
              c={isTitleMenuOpen ? "brand" : "text-medium"}
            />
          </UnstyledButton>
        )}

        <BenchNavTitleMenu
          isOpen={isTitleMenuOpen}
          onToggle={() => setIsTitleMenuOpen(!isTitleMenuOpen)}
          onClose={() => setIsTitleMenuOpen(false)}
        />

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
            <UnstyledButton h={32} px="sm" className={S.selectButton}>
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
