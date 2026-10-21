import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";

import type { SettingWidgetProps } from "../../settings/types";

const MAX_DROPDOWN_HEIGHT = "60vh";

/** Rests in the default button's hover gray, like a pressed Setup, and hovers darker. */
const BREAKOUT_SET_VARS = {
  root: {
    "--button-bg": "var(--mb-color-button-default-neutral-hover)",
    "--button-hover": "var(--mb-color-button-default-neutral-pressed)",
    "--button-pressed": "var(--mb-color-button-default-neutral-pressed)",
  },
};

type BreakoutMenuProps = SettingWidgetProps<string | null> & {
  columns?: { value: string; label: string }[];
};

export const BreakoutMenu = ({
  value,
  onChange,
  columns = [],
}: BreakoutMenuProps) => {
  const selected = columns.find((column) => column.value === value);
  const vars = selected !== undefined ? () => BREAKOUT_SET_VARS : undefined;

  const menu = (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button
          variant="default"
          vars={vars}
          leftSection={<Icon name="breakout" />}
          disabled={columns.length === 0}
        >
          {selected !== undefined ? t`By ${selected.label}` : t`Break out`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown mah={MAX_DROPDOWN_HEIGHT} style={{ overflowY: "auto" }}>
        {columns.map((column) => (
          <Menu.Item
            key={column.value}
            rightSection={
              column.value === value ? <Icon name="check" /> : undefined
            }
            onClick={() => onChange(column.value)}
          >
            {column.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );

  if (selected === undefined) {
    return menu;
  }

  // A split button: the clear button can't nest inside the menu's button.
  return (
    <Button.Group>
      {menu}
      <Button
        variant="default"
        vars={vars}
        px="sm"
        leftSection={<Icon name="close" />}
        aria-label={t`Remove breakout`}
        onClick={() => onChange(null)}
      />
    </Button.Group>
  );
};
