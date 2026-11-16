import { t } from "ttag";

import type { SettingWidgetProps } from "metabase/event-tables";
import { Button, Icon, Menu } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { Grain } from "../../spec/types";

import S from "./CountingMenu.module.css";

const getButtonLabel = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`Count people`;
    case "session":
      return t`Count sessions`;
    case "event":
      return t`Count events`;
  }
};

const GRAIN_ICONS: Record<Grain, IconName> = {
  person: "person",
  session: "clock",
  event: "calendar",
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
  /** Until a table is picked, there's nothing to count. */
  isDisabled?: boolean;
};

export const CountingMenu = ({
  value,
  onChange,
  options = [],
  isDisabled = false,
}: CountingMenuProps) => {
  const hasChoice = options.length > 1;
  const button = (
    <Button
      className={S.button}
      variant="default"
      leftSection={<Icon name={GRAIN_ICONS[value]} />}
      disabled={isDisabled}
      data-static={!hasChoice}
    >
      {getButtonLabel(value)}
    </Button>
  );

  if (!hasChoice) {
    return button;
  }

  return (
    <Menu>
      <Menu.Target>{button}</Menu.Target>
      <Menu.Dropdown>
        {options.map((grain) => (
          <Menu.Item
            key={grain}
            leftSection={<Icon name={GRAIN_ICONS[grain]} />}
            onClick={() => onChange(grain)}
          >
            {getOptionLabel(grain)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
