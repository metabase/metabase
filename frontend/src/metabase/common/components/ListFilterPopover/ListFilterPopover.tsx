import { type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  Button,
  Flex,
  Group,
  Icon,
  Indicator,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

type ListFilterPopoverProps = {
  hasActiveFilters: boolean;
  /** Called when the popover opens; sync the draft with the applied filters here */
  onOpen: () => void;
  onApply: () => void;
  onClear: () => void;
  children: ReactNode;
};

/** Filter button + popover shell for list pages: an Indicator-dotted trigger,
 * filter sections as children, and a Clear filters / Apply footer. */
export const ListFilterPopover = ({
  hasActiveFilters,
  onOpen,
  onApply,
  onClear,
  children,
}: ListFilterPopoverProps) => {
  const [opened, setOpened] = useState(false);

  const handleTriggerClick = () => {
    if (!opened) {
      onOpen();
    }
    setOpened(!opened);
  };

  const handleApply = () => {
    onApply();
    setOpened(false);
  };

  const handleClear = () => {
    onClear();
    setOpened(false);
  };

  return (
    <Popover
      position="bottom-end"
      shadow="sm"
      withinPortal
      opened={opened}
      onChange={setOpened}
    >
      <Popover.Target>
        <Indicator disabled={!hasActiveFilters} size={8} offset={8}>
          <Button
            variant="default"
            leftSection={<Icon name="filter" />}
            aria-label={t`Show filters`}
            onClick={handleTriggerClick}
          >
            {t`Filter`}
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown p="xl">
        <Stack gap="xxl" w={300}>
          {children}
          <Group gap="lg" grow>
            <Button variant="default" onClick={handleClear}>
              {t`Clear filters`}
            </Button>
            <Button variant="filled" onClick={handleApply}>
              {t`Apply`}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

type FilterSectionProps = {
  label: string;
  children: ReactNode;
};

export const FilterSection = ({ label, children }: FilterSectionProps) => (
  <Stack gap="sm">
    <Text fw="bold" fz="md" c="text-primary">
      {label}
    </Text>
    <Flex gap="sm" wrap="wrap">
      {children}
    </Flex>
  </Stack>
);

type FilterPillProps = {
  icon?: IconName;
  label: string;
  selected: boolean;
  onClick: () => void;
};

export const FilterPill = ({
  icon,
  label,
  selected,
  onClick,
}: FilterPillProps) => (
  <UnstyledButton
    onClick={onClick}
    bg={selected ? "background_surface-selected" : "background_page-primary"}
    bd="1px solid var(--mb-color-border-neutral)"
    px={12}
    py="sm"
    bdrs="xl"
  >
    <Flex gap="sm" align="center">
      {icon && <Icon name={icon} size={16} c="text-secondary" />}
      <Text fz="md" c="text-primary" lh="sm">
        {label}
      </Text>
    </Flex>
  </UnstyledButton>
);
