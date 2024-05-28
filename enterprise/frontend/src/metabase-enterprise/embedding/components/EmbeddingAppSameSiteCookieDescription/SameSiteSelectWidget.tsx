import { useState } from "react";

import { color } from "metabase/lib/colors";
import { Button, Group, Menu, Text, Icon } from "metabase/ui";
import type { SessionCookieSameSite } from "metabase-types/api";

interface Options {
  value: SessionCookieSameSite;
  name: string;
  description: string;
}

interface SameSiteSelectWidgetProps {
  onChange: (value: SessionCookieSameSite) => void;
  setting: {
    key: "session-cookie-samesite";
    value?: SessionCookieSameSite;
    defaultValue: SessionCookieSameSite;
    options: Options[];
  };
}

export function SameSiteSelectWidget({
  setting,
  onChange,
}: SameSiteSelectWidgetProps) {
  const [opened, setOpened] = useState(false);

  const selectedValue = setting.value ?? setting.defaultValue;
  const selectedOption = setting.options.find(
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
        {setting.options.map(({ value, name, description }) => (
          <Menu.Item key="value" onClick={() => onChange(value)}>
            <Text>{name}</Text>
            <Text c={color("text-light")}>{description}</Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
