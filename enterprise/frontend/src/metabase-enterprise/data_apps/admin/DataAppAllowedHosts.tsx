import { useState } from "react";
import { t } from "ttag";

import {
  Collapse,
  Group,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

type Props = {
  /** External origins the app may fetch/XHR (from `data_app.yml`). */
  hosts: string[];
};

/**
 * The app's network allowlist, shown in the admin list. Collapsed by default
 * (apps usually have none); expands to a vertical list of the allowed origins.
 */
export function DataAppAllowedHosts({ hosts }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (hosts.length === 0) {
    return (
      <Group gap="xs" align="center">
        <Text size="sm" c="text-tertiary">
          {t`Allowed hosts`}
        </Text>
        <Text size="sm" c="text-tertiary" fs="italic">
          {t`None`}
        </Text>
      </Group>
    );
  }

  return (
    <Stack gap={4}>
      <UnstyledButton
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <Group gap={6} align="center" wrap="nowrap">
          <Icon name={isOpen ? "chevrondown" : "chevronright"} size={12} />
          <Text size="sm" c="text-tertiary">
            {t`Allowed hosts (${hosts.length})`}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={isOpen}>
        <Stack gap={2} pl="lg">
          {hosts.map((host, index) => (
            <Text
              key={`${index}-${host}`}
              size="sm"
              ff="monospace"
              c="text-secondary"
            >
              {host}
            </Text>
          ))}
        </Stack>
      </Collapse>
    </Stack>
  );
}
