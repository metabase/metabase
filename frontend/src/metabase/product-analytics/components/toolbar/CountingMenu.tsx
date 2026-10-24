import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import {
  useSegmentDrag,
  useSegmentDropTarget,
} from "../../segments/drag-context";
import { isPeopleSegment } from "../../segments/to-event-definition";
import type { SettingWidgetProps } from "../../settings/types";
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
};

/**
 * Also where a people segment from the palette lands: the button lights up
 * while one is hovered or dragged, and takes the drop.
 */
export const CountingMenu = ({
  value,
  onChange,
  options = [],
}: CountingMenuProps) => {
  const { hovering, onPeopleSegment } = useSegmentDrag();
  const { isActive, dropProps } = useSegmentDropTarget({
    accepts: isPeopleSegment,
    onDrop: onPeopleSegment,
  });
  const isHinted = isActive || (hovering !== null && isPeopleSegment(hovering));

  return (
    <Menu>
      <Menu.Target>
        <Button
          className={S.button}
          variant="default"
          leftSection={<Icon name={GRAIN_ICONS[value]} />}
          data-hinted={isHinted}
          {...dropProps}
        >
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
};
