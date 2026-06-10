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

interface EntityMenuBaseItem {
  key?: string;
  testId?: string;
}

interface EntityMenuStyledItem extends EntityMenuBaseItem {
  title: string;
  icon?: string;
  tooltip?: ReactNode;
  color?: ColorName;
  hoverColor?: ColorName;
  hoverBgColor?: ColorName;
}

interface EntityMenuSeparatorItem extends EntityMenuBaseItem {
  separator: true;
}

interface EntityMenuContentItem extends EntityMenuStyledItem {
  content: (
    toggleMenu: () => void,
    setFreezeMenu: (freeze: boolean) => void,
  ) => ReactNode;
}

interface EntityMenuComponentItem extends EntityMenuBaseItem {
  component: ReactNode;
}

interface EntityMenuActionItem extends EntityMenuStyledItem {
  action?: (...args: never[]) => void;
  link?: string;
  externalLink?: boolean;
  event?: string;
  disabled?: boolean;
  onClose?: () => void;
}

type EntityMenuItemType =
  | EntityMenuSeparatorItem
  | EntityMenuContentItem
  | EntityMenuComponentItem
  | EntityMenuActionItem
  | null
  | undefined;

interface EntityMenuProps {
  items: EntityMenuItemType[];
  triggerIcon?: string;
  triggerProps?: EntityMenuIconButtonProps;
  minWidth?: number;
  tooltip?: string;
  trigger?: ReactElement;
  renderTrigger?: (props: { open: boolean; onClick: () => void }) => ReactNode;
  triggerAriaLabel?: string;
  tooltipPlacement?: "top" | "bottom";
  transitionDuration?: number;
  className?: string;
}

type EntityMenuItemStyle = CSSProperties & {
  "--entity-menu-item-color"?: string;
  "--entity-menu-item-hover-color"?: string;
  "--entity-menu-item-hover-bg-color"?: string;
};

function getItemStyle(
  item: EntityMenuStyledItem,
): EntityMenuItemStyle | undefined {
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
  minWidth,
  tooltip,
  trigger,
  renderTrigger,
  triggerAriaLabel,
  tooltipPlacement,
  transitionDuration = 150,
  className,
}: EntityMenuProps) {
  const [opened, setOpened] = useState(false);
  const [freezeMenu, setFreezeMenu] = useState(false);
  const [menuItemContent, setMenuItemContent] = useState<ReactNode>(null);

  const closeMenu = useCallback(() => {
    setOpened(false);
    setMenuItemContent(null);
  }, []);

  const toggleMenu = useCallback(() => {
    if (freezeMenu) {
      return;
    }

    setOpened((opened) => {
      const nextOpened = !opened;
      setMenuItemContent(null);
      return nextOpened;
    });
  }, [freezeMenu]);

  const handleOpenedChange = useCallback(
    (nextOpened: boolean) => {
      if (freezeMenu) {
        return;
      }

      setOpened(nextOpened);
      setMenuItemContent(null);
    },
    [freezeMenu],
  );

  const replaceMenuWithItemContent = useCallback((content: ReactNode) => {
    setMenuItemContent(content);
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
          tooltip={tooltip}
          tooltipPlacement={tooltipPlacement}
          triggerProps={triggerProps}
        />
      )}
    </div>
  );

  return (
    <Menu
      opened={opened}
      onChange={handleOpenedChange}
      position="bottom-end"
      transitionProps={{ duration: transitionDuration }}
      closeOnItemClick={false}
    >
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown miw={minWidth ?? 184}>
        {menuItemContent ||
          items.map((item, index) => {
            if (!item) {
              return null;
            }

            const key = item.key ?? ("title" in item ? item.title : index);

            if ("separator" in item && item.separator) {
              return <Menu.Divider key={key} />;
            }

            if ("content" in item && item.content) {
              return (
                <MenuItemTooltip key={key} tooltip={item.tooltip}>
                  <Menu.Item
                    className={S.item}
                    data-testid={item.testId}
                    disabled={false}
                    leftSection={getLeftSection(item.icon)}
                    style={getItemStyle(item)}
                    onClick={() =>
                      replaceMenuWithItemContent(
                        item.content(toggleMenu, setFreezeMenu),
                      )
                    }
                  >
                    {item.title}
                  </Menu.Item>
                </MenuItemTooltip>
              );
            }

            if ("component" in item && item.component) {
              return (
                <div key={key} data-testid={item.testId}>
                  {item.component}
                </div>
              );
            }

            if (
              "action" in item &&
              "link" in item &&
              item.action &&
              item.link
            ) {
              return null;
            }

            if ("link" in item && item.link) {
              const handleClick = () => {
                closeMenu();
                item.onClose?.();
              };

              if (item.externalLink) {
                return (
                  <MenuItemTooltip key={key} tooltip={item.tooltip}>
                    <Menu.Item
                      className={S.item}
                      component="a"
                      data-testid={item.testId ?? "entity-menu-link"}
                      disabled={item.disabled}
                      href={item.link}
                      leftSection={getLeftSection(item.icon)}
                      style={getItemStyle(item)}
                      target="_blank"
                      onClick={handleClick}
                    >
                      {item.title}
                    </Menu.Item>
                  </MenuItemTooltip>
                );
              }

              return (
                <MenuItemTooltip key={key} tooltip={item.tooltip}>
                  <Menu.Item
                    className={S.item}
                    component={Link}
                    data-testid={item.testId ?? "entity-menu-link"}
                    disabled={item.disabled}
                    leftSection={getLeftSection(item.icon)}
                    style={getItemStyle(item)}
                    to={item.link}
                    onClick={handleClick}
                  >
                    {item.title}
                  </Menu.Item>
                </MenuItemTooltip>
              );
            }

            if ("action" in item && item.action) {
              return (
                <MenuItemTooltip key={key} tooltip={item.tooltip}>
                  <Menu.Item
                    className={S.item}
                    data-testid={item.testId}
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
