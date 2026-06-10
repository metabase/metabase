import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useCallback, useState } from "react";
import { Link } from "react-router";

import { EntityMenuTrigger } from "metabase/common/components/EntityMenuTrigger";
import type { EntityMenuIconButtonProps } from "metabase/common/components/EntityMenuTrigger/EntityMenuTrigger.styled";
import { Icon, Menu, Tooltip } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import { color } from "metabase/ui/utils/colors";
import type { IconName } from "metabase-types/api";

import S from "./EntityMenu.module.css";

interface EntityMenuItem {
  key?: string;
  title: string;
  icon?: string;
  tooltip?: ReactNode;
  color?: ColorName;
  hoverColor?: ColorName;
  hoverBgColor?: ColorName;
  action?: (...args: never[]) => void;
  link?: string;
  disabled?: boolean;
}

type EntityMenuItemType = EntityMenuItem | null | undefined;

interface EntityMenuProps {
  items: EntityMenuItemType[];
  triggerIcon?: string;
  triggerProps?: EntityMenuIconButtonProps;
  trigger?: ReactElement;
  renderTrigger?: (props: { open: boolean; onClick: () => void }) => ReactNode;
  triggerAriaLabel?: string;
  className?: string;
}

type EntityMenuItemStyle = CSSProperties & {
  "--entity-menu-item-color"?: string;
  "--entity-menu-item-hover-color"?: string;
  "--entity-menu-item-hover-bg-color"?: string;
};

function getItemStyle(item: EntityMenuItem): EntityMenuItemStyle | undefined {
  const style: EntityMenuItemStyle = {};

  if (item.color) {
    style["--entity-menu-item-color"] = color(item.color);
  }

  if (item.hoverColor) {
    style["--entity-menu-item-hover-color"] = color(item.hoverColor);
  }

  if (item.hoverBgColor) {
    style["--entity-menu-item-hover-bg-color"] = color(item.hoverBgColor);
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function getLeftSection(icon: string | undefined) {
  if (!icon) {
    return undefined;
  }

  return <Icon name={icon as IconName} size={16} aria-hidden />;
}

interface MenuItemTooltipProps {
  tooltip?: ReactNode;
  children: ReactElement;
}

function MenuItemTooltip({ tooltip, children }: MenuItemTooltipProps) {
  return (
    <Tooltip label={tooltip} disabled={tooltip == null} position="right">
      {children}
    </Tooltip>
  );
}

/**
 * @deprecated: use Menu from "metabase/ui"
 */
export function EntityMenu({
  items,
  triggerIcon = "ellipsis",
  triggerProps,
  trigger,
  renderTrigger,
  triggerAriaLabel,
  className,
}: EntityMenuProps) {
  const [opened, setOpened] = useState(false);

  const closeMenu = useCallback(() => {
    setOpened(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setOpened((opened) => !opened);
  }, []);

  const target = (
    <div className={className}>
      {renderTrigger ? (
        renderTrigger({ open: opened, onClick: toggleMenu })
      ) : (
        <EntityMenuTrigger
          ariaLabel={triggerAriaLabel}
          trigger={trigger}
          icon={triggerIcon}
          onClick={toggleMenu}
          open={opened}
          triggerProps={triggerProps}
        />
      )}
    </div>
  );

  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      closeOnItemClick={false}
    >
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown miw={184}>
        {items.map((item, index) => {
          if (!item) {
            return null;
          }

          const key = item.key ?? item.title ?? index;

          if (item.link) {
            return (
              <MenuItemTooltip key={key} tooltip={item.tooltip}>
                <Menu.Item
                  className={S.item}
                  component={Link}
                  data-testid="entity-menu-link"
                  disabled={item.disabled}
                  leftSection={getLeftSection(item.icon)}
                  style={getItemStyle(item)}
                  to={item.link}
                  onClick={closeMenu}
                >
                  {item.title}
                </Menu.Item>
              </MenuItemTooltip>
            );
          }

          if (item.action) {
            return (
              <MenuItemTooltip key={key} tooltip={item.tooltip}>
                <Menu.Item
                  className={S.item}
                  disabled={item.disabled}
                  leftSection={getLeftSection(item.icon)}
                  style={getItemStyle(item)}
                  onClick={() => {
                    item.action?.();
                    closeMenu();
                  }}
                >
                  {item.title}
                </Menu.Item>
              </MenuItemTooltip>
            );
          }

          return null;
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
