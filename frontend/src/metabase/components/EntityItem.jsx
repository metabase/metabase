/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import { t } from "ttag";
import cx from "classnames";

import EntityMenu from "metabase/components/EntityMenu";
import Swapper from "metabase/components/Swapper";
import CheckBox from "metabase/core/components/CheckBox";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { isItemPinned } from "metabase/collections/utils";

import {
  EntityIconWrapper,
  EntityItemActions,
  EntityItemSpinner,
  EntityItemWrapper,
  EntityMenuContainer,
  PinButton,
} from "./EntityItem.styled";

function EntityIconCheckBox({
  item,
  variant,
  icon,
  pinned,
  selectable,
  selected,
  showCheckbox,
  disabled,
  onToggleSelected,
  ...props
}) {
  const iconSize = variant === "small" ? 12 : 18;
  const handleClick = e => {
    e.preventDefault();
    onToggleSelected();
  };

  return (
    <EntityIconWrapper
      isPinned={pinned}
      model={item.model}
      onClick={selectable ? handleClick : null}
      rounded
      disabled={disabled}
      {...props}
    >
      {selectable ? (
        <Swapper
          startSwapped={selected || showCheckbox}
          defaultElement={
            <Icon
              name={icon.name}
              color={icon.color ?? "inherit"}
              size={iconSize}
            />
          }
          swappedElement={<CheckBox checked={selected} size={iconSize} />}
        />
      ) : (
        <Icon
          name={icon.name}
          color={icon.color ?? "inherit"}
          size={iconSize}
        />
      )}
    </EntityIconWrapper>
  );
}

function EntityItemName({ name, variant }) {
  return (
    <h3
      className={cx("overflow-hidden", {
        "text-list": variant === "list",
      })}
    >
      <Ellipsified>{name}</Ellipsified>
    </h3>
  );
}

function EntityItemMenu({
  isBookmarked,
  item,
  onPin,
  onMove,
  onCopy,
  onArchive,
  onToggleBookmark,
  className,
  analyticsContext,
}) {
  const isPinned = isItemPinned(item);
  const showPinnedAction = onPin && isPinned;
  const showUnpinnedAction = onPin && !isPinned;

  const actions = useMemo(
    () =>
      [
        showPinnedAction && {
          title: isPinned ? t`Unpin` : t`Pin this`,
          icon: "pin",
          action: onPin,
          event: `${analyticsContext};Entity Item;Pin Item;${item.model}`,
        },
        onMove && {
          title: t`Move`,
          icon: "move",
          action: onMove,
          event: `${analyticsContext};Entity Item;Move Item;${item.model}`,
        },
        onCopy && {
          title: t`Duplicate`,
          icon: "clone",
          action: onCopy,
          event: `${analyticsContext};Entity Item;Copy Item;${item.model}`,
        },
        onArchive && {
          title: t`Archive`,
          icon: "archive",
          action: onArchive,
          event: `${analyticsContext};Entity Item;Archive Item;${item.model}`,
        },
        onToggleBookmark && {
          title: isBookmarked ? t`Remove from bookmarks` : t`Bookmark`,
          icon: "bookmark",
          action: onToggleBookmark,
          event: `${analyticsContext};Entity Item;Bookmark Item;${item.model}`,
        },
      ].filter(action => action),
    [
      isBookmarked,
      onToggleBookmark,
      showPinnedAction,
      isPinned,
      onPin,
      analyticsContext,
      item.model,
      onMove,
      onCopy,
      onArchive,
    ],
  );
  if (actions.length === 0) {
    return null;
  }
  return (
    <EntityMenuContainer align="center">
      {showUnpinnedAction && (
        <Tooltip tooltip={t`Pin this`}>
          <PinButton icon="pin" onClick={onPin} />
        </Tooltip>
      )}
      <EntityMenu
        className={cx(className, "hover-child")}
        triggerIcon="ellipsis"
        items={actions}
      />
    </EntityMenuContainer>
  );
}

const EntityItem = ({
  analyticsContext,
  name,
  iconName,
  onPin,
  onMove,
  onCopy,
  onArchive,
  selected,
  onToggleSelected,
  selectable,
  variant,
  item,
  buttons,
  extraInfo,
  pinned,
  loading,
  disabled,
}) => {
  const icon = useMemo(() => ({ name: iconName }), [iconName]);

  return (
    <EntityItemWrapper
      className={cx("hover-parent hover--visibility", {
        "bg-light-hover": variant === "list",
      })}
      variant={variant}
      disabled={disabled}
    >
      <EntityIconCheckBox
        item={item}
        variant={variant}
        icon={icon}
        pinned={pinned}
        selectable={selectable}
        selected={selected}
        disabled={disabled}
        onToggleSelected={onToggleSelected}
      />

      <div className="overflow-hidden">
        <EntityItemName name={name} />
        <div>{extraInfo && extraInfo}</div>
      </div>

      <EntityItemActions onClick={e => e.preventDefault()}>
        {buttons}
        {loading && <EntityItemSpinner size={24} borderWidth={3} />}
        <EntityItemMenu
          item={item}
          onPin={onPin}
          onMove={onMove}
          onCopy={onCopy}
          onArchive={onArchive}
          className="ml1"
          analyticsContext={analyticsContext}
        />
      </EntityItemActions>
    </EntityItemWrapper>
  );
};

EntityItem.defaultProps = {
  selectable: false,
};

EntityItem.IconCheckBox = EntityIconCheckBox;
EntityItem.Name = EntityItemName;
EntityItem.Menu = EntityItemMenu;

export default EntityItem;
