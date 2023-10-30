import { useState } from "react";
import { useSelector } from "react-redux";
import type { State } from "metabase-types/store";
import { getSetting } from "metabase/selectors/settings";
import { Button, Group, Menu, Text } from "metabase/ui";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

interface Options {
  value: string;
  name: string;
  description: string;
}

interface SameSiteSelectWidgetProps {
  onChange: (value: string) => void;
  setting: {
    key: string;
    value?: string;
    defaultValue: string;
    options: Options[];
  };
}

export function SameSiteSelectWidget({
  setting,
  onChange,
}: SameSiteSelectWidgetProps) {
  const [opened, setOpened] = useState(false);
  const authorizedOrigins = useSelector((state: State) =>
    getSetting(state, "embedding-app-origin"),
  );

  // ! Use authorizedOrigins to add note if it does not match the MB
  // ! instance domain
  if (authorizedOrigins) {
    authorizedOrigins ?? null;
  }

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
