import cx from "classnames";
import { type ReactElement, type ReactNode, useMemo } from "react";
import { c, t } from "ttag";

import { archiveAndTrack } from "metabase/archive/analytics";
import type {
  OnArchive,
  OnCopy,
  OnDeletePermanently,
  OnMove,
  OnPin,
  OnRestore,
  OnToggleBookmark,
} from "metabase/common/collections/types";
import { isItemModel, isItemPinned } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link";
import { ActionIcon, Flex, Icon, Menu, Tooltip } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import * as Urls from "metabase/urls";
import type { CollectionItem, IconName } from "metabase-types/api";

import S from "./EntityItemMenu.module.css";

type EntityItemMenuAction = {
  title: string;
  icon: IconName;
  action?: () => void;
  link?: string;
  tooltip?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
};

function getLeftSection(icon: IconName) {
  return <Icon name={icon} aria-hidden />;
}

function MenuItemTooltip({
  tooltip,
  children,
}: {
  tooltip?: ReactNode;
  children: ReactElement;
}) {
  return (
    <Tooltip label={tooltip} disabled={tooltip == null} position="right">
      {children}
    </Tooltip>
  );
}

export function EntityItemMenu({
  item,
  isBookmarked,
  isSelected,
  isXrayEnabled,
  onPin,
  onMove,
  onCopy,
  onArchive,
  onRestore,
  onDeletePermanently,
  onToggleBookmark,
  onToggleSelected,
  className,
}: {
  item: CollectionItem;
  isBookmarked?: boolean;
  isSelected?: boolean;
  isXrayEnabled?: boolean;
  onPin?: OnPin;
  onMove?: OnMove;
  onCopy?: OnCopy;
  onArchive?: OnArchive;
  onRestore?: OnRestore;
  onDeletePermanently?: OnDeletePermanently;
  onToggleBookmark?: OnToggleBookmark;
  onToggleSelected?: () => void;
  className?: string;
}) {
  const isPinned = isItemPinned(item);
  const isModel = isItemModel(item);
  const isXrayShown = isModel && isXrayEnabled;

  const actions = useMemo(() => {
    const result: EntityItemMenuAction[] = [];

    if (onToggleSelected) {
      result.push({
        title: isSelected ? t`Deselect` : t`Select`,
        icon: "check",
        action: onToggleSelected,
      });
    }

    if (onPin) {
      result.push({
        title: isPinned ? t`Unpin` : t`Pin this`,
        icon: isPinned ? "unpin" : "pin",
        action: onPin,
      });
    }

    if (onToggleBookmark) {
      result.push({
        title: isBookmarked ? t`Remove from bookmarks` : c("Verb").t`Bookmark`,
        icon: "bookmark",
        action: onToggleBookmark,
      });
    }

    if (isXrayShown) {
      result.push({
        title: t`X-ray this`,
        link: Urls.xrayModel(item.id),
        icon: "bolt",
      });
    }

    if (onCopy) {
      result.push({
        title: c("Verb").t`Duplicate`,
        icon: "clone",
        action: () => onCopy([item]),
      });
    }

    if (onMove) {
      result.push({
        title: t`Move`,
        icon: "move",
        action: () => onMove([item]),
      });
    }

    if (onArchive) {
      result.push({
        title: t`Move to trash`,
        icon: "trash",
        action: () =>
          archiveAndTrack({
            archive: onArchive,
            model: item.model,
            modelId: item.id,
            triggeredFrom: "collection",
          }),
      });
    }

    if (onRestore) {
      result.push({
        title: t`Restore`,
        icon: "revert",
        action: onRestore,
      });
    }

    if (onDeletePermanently) {
      result.push({
        title: t`Delete permanently`,
        icon: "trash",
        action: onDeletePermanently,
        danger: true,
      });
    }

    return result;
  }, [
    item,
    isPinned,
    isXrayShown,
    isBookmarked,
    isSelected,
    onPin,
    onMove,
    onCopy,
    onArchive,
    onToggleBookmark,
    onToggleSelected,
    onDeletePermanently,
    onRestore,
  ]);
  if (actions.length === 0) {
    return null;
  }
  return (
    <Flex align="center" ta="center" c="text-secondary">
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            aria-label={t`Actions`}
            className={className}
            variant="subtle"
          >
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {actions.map((action) => {
            const key = action.title;
            const disabledProps = action.disabled
              ? { "aria-disabled": true, "data-disabled": true }
              : {};
            const dangerColor: ColorName | undefined = action.danger
              ? "danger"
              : undefined;
            const menuItemProps = {
              ...disabledProps,
              className: cx(S.menuItem, { [S.dangerItem]: action.danger }),
              leftSection: getLeftSection(action.icon),
              c: dangerColor,
            };

            if (action.link) {
              return (
                <MenuItemTooltip key={key} tooltip={action.tooltip}>
                  <Menu.Item
                    {...menuItemProps}
                    component={Link}
                    data-testid="entity-menu-link"
                    to={action.link}
                    onClick={(event) => {
                      if (action.disabled) {
                        event.preventDefault();
                        event.stopPropagation();
                      }
                    }}
                  >
                    {action.title}
                  </Menu.Item>
                </MenuItemTooltip>
              );
            }

            return (
              <MenuItemTooltip key={key} tooltip={action.tooltip}>
                <Menu.Item
                  {...menuItemProps}
                  onClick={(event) => {
                    if (action.disabled) {
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }

                    action.action?.();
                  }}
                >
                  {action.title}
                </Menu.Item>
              </MenuItemTooltip>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </Flex>
  );
}
