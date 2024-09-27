import { useState } from "react";
import { t } from "ttag";

import { Button, Group, Icon, Menu, Text } from "metabase/ui";
import type { SessionCookieSameSite } from "metabase-types/api";

const SAME_SITE_OPTIONS: Options[] = [
  {
    value: "lax",
    name: t`Lax (default)`,
    description: t`Allows cookies to be sent when a user is navigating to the origin site from an external site (like when following a link).`,
  },
  {
    value: "strict",
    name: t`Strict (not recommended)`,
    // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings
    description: t`Never allows cookies to be sent on a cross-site request. Warning: this will prevent users from following external links to Metabase.`,
  },
  {
    value: "none",
    name: t`None`,
    description: t`Allows all cross-site requests. Incompatible with most Safari and iOS-based browsers.`,
  },
];

interface Options {
  value: SessionCookieSameSite;
  name: string;
  description: string;
}

interface SameSiteSelectWidgetProps {
  onChange: (value: SessionCookieSameSite) => void;
  setting: {
    key: "session-cookie-samesite";
    value: SessionCookieSameSite | null;
  };
}

const DEFAULT_SAME_SITE_VALUE = "lax";
export function SameSiteSelectWidget({
  setting,
  onChange,
}: SameSiteSelectWidgetProps) {
  const [opened, setOpened] = useState(false);

  const selectedValue = setting.value ?? DEFAULT_SAME_SITE_VALUE;
  const selectedOption = SAME_SITE_OPTIONS.find(
    ({ value }) => value === selectedValue,
  );

  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="sm"
    >
      <Menu.Target>
        <Button variant={opened ? "outline" : "default"}>
          <Group position="apart" miw="10rem">
            <span>{selectedOption?.name}</span>
            <Icon name="chevrondown" size="12" />
          </Group>
        </Button>
      </Menu.Target>

      <Menu.Dropdown maw={"21rem"}>
        {SAME_SITE_OPTIONS.map(({ value, name, description }) => (
          <Menu.Item key="value" onClick={() => onChange(value)}>
            <Text>{name}</Text>
            <Text c="text-light">{description}</Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
