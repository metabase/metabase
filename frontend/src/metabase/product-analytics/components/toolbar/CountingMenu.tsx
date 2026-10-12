import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";

import type { SettingWidgetProps } from "../../settings/types";
import type { Grain } from "../../spec/types";

const getButtonLabel = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`counting people`;
    case "session":
      return t`counting sessions`;
    case "event":
      return t`counting events`;
  }
};

const getOptionLabel = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`People`;
    case "session":
      return t`Sessions`;
    case "event":
      return t`Events`;
  }
};

type CountingMenuProps = SettingWidgetProps<Grain> & {
  options?: Grain[];
};

export const CountingMenu = ({
  value,
  onChange,
  options = [],
}: CountingMenuProps) => (
  <Menu>
    <Menu.Target>
      <Button variant="default" leftSection={<Icon name="group" />}>
        {getButtonLabel(value)}
      </Button>
    </Menu.Target>
    <Menu.Dropdown>
      {options.map((grain) => (
        <Menu.Item key={grain} onClick={() => onChange(grain)}>
          {getOptionLabel(grain)}
        </Menu.Item>
      ))}
    </Menu.Dropdown>
  </Menu>
);
