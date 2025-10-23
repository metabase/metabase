import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { BenchNavItem } from "metabase/bench/components/nav/BenchNavItem";
import {
  BENCH_NAV_SECTIONS,
  OVERVIEW_ITEM,
} from "metabase/bench/constants/navigation";
import ExternalLink from "metabase/common/components/ExternalLink";
import LogoIcon from "metabase/common/components/LogoIcon";
import { Box, Icon, Menu, Stack, Text, UnstyledButton } from "metabase/ui";

interface BenchNavSectionProps {
  title: string;
  children: ReactNode;
}

function BenchNavSection({ title, children }: BenchNavSectionProps) {
  return (
    <Box pb="sm">
      <Text size="sm" c="text-medium" my="md" px="sm">
        {title}
      </Text>
      <Stack gap={0}>{children}</Stack>
    </Box>
  );
}

interface BenchNavMenuProps {
  onClose: () => void;
}

export function BenchNavMenu({ onClose }: BenchNavMenuProps) {
  return (
    <Box w={320} data-testid="bench-nav-menu">
      <Stack gap={0} p="lg">
        <BenchNavItem
          url={OVERVIEW_ITEM.url}
          icon={OVERVIEW_ITEM.icon}
          label={OVERVIEW_ITEM.getLabel()}
          onClick={onClose}
        />

        {BENCH_NAV_SECTIONS.map((section) => (
          <BenchNavSection key={section.id} title={section.getTitle()}>
            {section.items.map((item) => {
              const navItem = (
                <BenchNavItem
                  key={item.id}
                  url={item.url}
                  icon={item.icon}
                  label={item.getLabel()}
                  onClick={onClose}
                />
              );

              return item.nested ? (
                <Box key={item.id} pl="md">
                  {navItem}
                </Box>
              ) : (
                navItem
              );
            })}
          </BenchNavSection>
        ))}
      </Stack>
    </Box>
  );
}

interface BenchNavTitleMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function BenchNavTitleMenu({
  isOpen,
  onToggle,
  onClose,
}: BenchNavTitleMenuProps) {
  return (
    <Menu
      data-testid="bench-nav-title-menu"
      opened={isOpen}
      onClose={onClose}
      position="bottom-start"
      shadow="md"
      width={200}
    >
      <Menu.Target>
        <UnstyledButton
          mx="sm"
          ml={0}
          h="2.25rem"
          w="1.5rem"
          onClick={onToggle}
        >
          <LogoIcon size={32} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="rocket" size={16} />}
          rightSection={
            <Text size="xs" c="text-light">
              {t`⌘1`}
            </Text>
          }
          component={Link}
          to="/"
        >
          {t`Explore`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="notebook" size={16} />}
          rightSection={
            <Text size="xs" c="text-light">
              {t`⌘2`}
            </Text>
          }
          component={Link}
          to="/bench"
        >
          {t`Workbench`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="gear" size={16} />}
          rightSection={
            <Text size="xs" c="text-light">
              {t`⌘3`}
            </Text>
          }
          component={Link}
          to="/admin"
        >
          {t`Admin`}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          component={ExternalLink}
          // eslint-disable-next-line no-unconditional-metabase-links-render -- FIXME: hide the link
          href="https://www.metabase.com/docs"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Text size="sm">{t`Docs`}</Text>
        </Menu.Item>
        <Menu.Item component={Link} to="/admin/people">
          <Text size="sm">
            {/* eslint-disable-next-line no-literal-metabase-strings -- FIXME: use application name */}
            {t`Metabase Account`}
          </Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
