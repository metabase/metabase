import { useState } from "react";
import { t } from "ttag";

import { Button, Icon, Menu, Tooltip } from "metabase/ui";

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

/** An icon button in the toolbar's button group; the tooltip names the breakout. */
export const BreakoutMenu = ({
  value,
  onChange,
  columns = [],
}: BreakoutMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = columns.find((column) => column.value === value);
  const vars = selected !== undefined ? () => BREAKOUT_SET_VARS : undefined;
  const label =
    selected !== undefined ? t`Broken out by ${selected.label}` : t`Break out`;

  return (
    <Menu position="bottom-start" opened={isOpen} onChange={setIsOpen}>
      <Menu.Target>
        <Tooltip label={label} disabled={isOpen}>
          <Button
            variant="default"
            px="sm"
            vars={vars}
            aria-label={label}
            aria-pressed={selected !== undefined}
            disabled={columns.length === 0}
          >
            <Icon name="split_branch" />
          </Button>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown mah={MAX_DROPDOWN_HEIGHT} style={{ overflowY: "auto" }}>
        {selected !== undefined && (
          <>
            <Menu.Item
              leftSection={<Icon name="close" />}
              onClick={() => onChange(null)}
            >
              {t`Remove breakout`}
            </Menu.Item>
            <Menu.Divider />
          </>
        )}
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
};
