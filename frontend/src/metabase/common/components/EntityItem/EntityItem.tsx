import cx from "classnames";
import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";
import { Link } from "react-router";
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
  OnTogglePreview,
  OnToggleSelected,
} from "metabase/common/collections/types";
import {
  isFullyParameterized,
  isItemModel,
  isItemPinned,
  isPreviewShown,
} from "metabase/common/collections/utils";
import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Swapper } from "metabase/common/components/Swapper";
import type { IconData } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import type { IconProps } from "metabase/ui";
import {
  ActionIcon,
  Checkbox,
  Ellipsified,
  Icon,
  Menu,
  Tooltip,
} from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import * as Urls from "metabase/urls";
import type { CollectionItem, IconName } from "metabase-types/api";

import S from "./EntityItem.module.css";
import {
  EntityIconWrapper,
  EntityItemActions,
  EntityItemSpinner,
  EntityItemWrapper,
  EntityMenuContainer,
} from "./EntityItem.styled";

type EntityIconCheckBoxProps = {
  variant?: string;
  icon: IconProps | IconData;
  pinned?: boolean;
  selectable?: boolean;
  selected?: boolean;
  showCheckbox?: boolean;
  disabled?: boolean;
  onToggleSelected?: () => void;
};

const EntityIconCheckBox = ({
  variant,
  icon,
  pinned,
  selectable,
  selected,
  showCheckbox,
  disabled,
  onToggleSelected,
  ...props
}: EntityIconCheckBoxProps) => {
  const iconSize = variant === "small" ? 12 : 16;
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    onToggleSelected?.();
    // helps keyboard shortcuts work for collection items
    e.currentTarget.focus();
  };

  return (
    <EntityIconWrapper
      isPinned={pinned}
      onClick={selectable ? handleClick : () => {}}
      disabled={disabled}
      {...props}
    >
      {selectable ? (
        <Swapper
          defaultElement={
            <EntityIcon
              {...icon}
              color={icon.color ?? "inherit"}
              size={iconSize}
            />
          }
          swappedElement={
            <Checkbox
              checked={selected}
              size={iconSize === 12 ? "xs" : "sm"}
              // Visual-only; clicks are handled by the wrapping button.
              style={{ pointerEvents: "none" }}
            />
          }
          isSwapped={selected || showCheckbox}
        />
      ) : (
        <EntityIcon {...icon} color={icon.color ?? "inherit"} size={iconSize} />
      )}
    </EntityIconWrapper>
  );
};

function EntityItemName({
  name,
  variant,
  ...props
}: {
  name: string;
  variant?: string;
} & React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cx(CS.overflowHidden, {
        [CS.textList]: variant === "list",
      })}
      {...props}
    >
      <Ellipsified>{name}</Ellipsified>
    </h3>
  );
}

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

function EntityItemMenu({
  item,
  isBookmarked,
  isXrayEnabled,
  onPin,
  onMove,
  onCopy,
  onArchive,
  onRestore,
  onDeletePermanently,
  onToggleBookmark,
  onTogglePreview,
  className,
}: {
  item: CollectionItem;
  isBookmarked?: boolean;
  isXrayEnabled?: boolean;
  onPin?: OnPin;
  onMove?: OnMove;
  onCopy?: OnCopy;
  onArchive?: OnArchive;
  onRestore?: OnRestore;
  onDeletePermanently?: OnDeletePermanently;
  onToggleBookmark?: OnToggleBookmark;
  onTogglePreview?: OnTogglePreview;
  className?: string;
}) {
  const isPinned = isItemPinned(item);
  const isPreviewed = isPreviewShown(item);
  const isParameterized = isFullyParameterized(item);
  const isModel = isItemModel(item);
  const isXrayShown = isModel && isXrayEnabled;

  const actions = useMemo(() => {
    const result: EntityItemMenuAction[] = [];

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

    if (onTogglePreview) {
      result.push({
        title: isPreviewed
          ? t`Don’t show visualization`
          : t`Show visualization`,
        icon: isPreviewed ? "eye_crossed_out" : "eye",
        action: onTogglePreview,
        tooltip: !isParameterized
          ? t`Open this question and fill in its variables to see it.`
          : undefined,
        disabled: !isParameterized,
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
    isPreviewed,
    isParameterized,
    isBookmarked,
    onPin,
    onMove,
    onCopy,
    onArchive,
    onTogglePreview,
    onToggleBookmark,
    onDeletePermanently,
    onRestore,
  ]);
  if (actions.length === 0) {
    return null;
  }
  return (
    <EntityMenuContainer style={{ textAlign: "center" }}>
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
    </EntityMenuContainer>
  );
}

export const EntityItem = ({
  name,
  iconName,
  onPin,
  onMove,
  onCopy,
  onArchive,
  selected,
  onToggleSelected,
  selectable = false,
  variant,
  item,
  buttons,
  extraInfo,
  pinned,
  loading,
  disabled,
}: {
  name: string;
  iconName: IconName;
  onPin?: OnPin;
  onMove?: OnMove;
  onCopy?: OnCopy;
  onArchive?: OnArchive;
  selected?: boolean;
  onToggleSelected?: OnToggleSelected;
  selectable?: boolean;
  variant?: string;
  item: CollectionItem;
  buttons?: ReactNode;
  extraInfo?: ReactNode;
  pinned?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) => {
  const icon = useMemo(() => ({ name: iconName }), [iconName]);

  return (
    <EntityItemWrapper
      className={cx(CS.hoverParent, CS.hoverVisibility, {
        [CS.bgLightHover]: variant === "list",
      })}
      variant={variant}
      disabled={disabled}
    >
      <EntityIconCheckBox
        variant={variant}
        icon={icon}
        pinned={pinned}
        selectable={selectable}
        selected={selected}
        disabled={disabled}
        onToggleSelected={onToggleSelected}
      />

      <div className={CS.overflowHidden}>
        <EntityItemName name={name} />
        <div>{extraInfo && extraInfo}</div>
      </div>

      <EntityItemActions onClick={(e) => e.preventDefault()}>
        {buttons}
        {loading && <EntityItemSpinner size={24} borderWidth={3} />}
        <EntityItemMenu
          item={item}
          onPin={onPin}
          onMove={onMove}
          onCopy={onCopy}
          onArchive={onArchive}
        />
      </EntityItemActions>
    </EntityItemWrapper>
  );
};

EntityItem.IconCheckBox = EntityIconCheckBox;
EntityItem.Name = EntityItemName;
EntityItem.Menu = EntityItemMenu;
