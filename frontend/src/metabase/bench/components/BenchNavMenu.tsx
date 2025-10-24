import type { ReactNode } from "react";
import { Link } from "react-router";

import { BenchNavItem } from "metabase/bench/components/nav/BenchNavItem";
import {
  BENCH_NAV_SECTIONS,
  OVERVIEW_ITEM,
} from "metabase/bench/constants/navigation";
import LogoIcon from "metabase/common/components/LogoIcon";
import { Box, Stack, Text, UnstyledButton } from "metabase/ui";

import S from "./BenchNavMenu.module.css";

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

export function BenchNavTitleMenu() {
  return (
    <UnstyledButton
      component={Link}
      to="/"
      display="flex"
      className={S.logoButton}
      h="3.25rem"
      miw="2.25rem"
      maw="14rem"
      mr="sm"
    >
      <LogoIcon height={32} />
    </UnstyledButton>
  );
}
