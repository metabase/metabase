import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Popover,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./IconPicker.module.css";
import { COLLECTION_ICON_NAMES } from "./constants";

export const DEFAULT_ICON_NAME: IconName = "folder";

export interface IconPickerProps {
  value: IconName | null;
  onChange: (icon: IconName | null) => void;
  label?: string;
  "data-testid"?: string;
}

export function IconPicker({
  value,
  onChange,
  label,
  "data-testid": dataTestId,
}: IconPickerProps) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const [search, setSearch] = useState("");

  const visibleIcons = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? COLLECTION_ICON_NAMES.filter((name) => name.includes(query))
      : COLLECTION_ICON_NAMES;
  }, [search]);

  const handleSelect = (icon: IconName) => {
    onChange(icon);
    close();
  };

  const handleReset = () => {
    onChange(null);
    close();
  };

  return (
    <Popover
      opened={opened}
      onDismiss={close}
      position="bottom-start"
      trapFocus
    >
      <Popover.Target>
        <ActionIcon
          variant="default"
          size="lg"
          aria-label={label ?? t`Icon`}
          data-testid={dataTestId}
          onClick={toggle}
        >
          <Icon name={value ?? DEFAULT_ICON_NAME} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="sm" w="20rem">
          <TextInput
            value={search}
            placeholder={t`Search icons…`}
            aria-label={t`Search icons`}
            leftSection={<Icon name="search" />}
            onChange={(event) => setSearch(event.target.value)}
          />
          {visibleIcons.length === 0 ? (
            <Text c="text-secondary">{t`No icons match your search.`}</Text>
          ) : (
            <SimpleGrid className={S.grid} cols={8} spacing="xs">
              {visibleIcons.map((iconName) => (
                <ActionIcon
                  key={iconName}
                  variant={iconName === value ? "filled" : "subtle"}
                  aria-label={iconName}
                  aria-pressed={iconName === value}
                  onClick={() => handleSelect(iconName)}
                >
                  <Icon name={iconName} />
                </ActionIcon>
              ))}
            </SimpleGrid>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={handleReset}>
              {t`Default`}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
