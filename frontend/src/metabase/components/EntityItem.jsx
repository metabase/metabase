/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import { t } from "ttag";
import cx from "classnames";
import { Box, Flex } from "grid-styled";

import EntityMenu from "metabase/components/EntityMenu";
import Swapper from "metabase/components/Swapper";
import CheckBox from "metabase/components/CheckBox";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

import {
  EntityIconWrapper,
  EntityItemSpinner,
  EntityItemWrapper,
  EntityMenuContainer,
  PinButton,
} from "./EntityItem.styled";

function EntityIconCheckBox({
  item,
  variant,
  iconName,
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
            <Icon name={iconName} color={"inherit"} size={iconSize} />
          }
          swappedElement={<CheckBox checked={selected} size={iconSize} />}
        />
      ) : (
        <Icon name={iconName} color={"inherit"} size={iconSize} />
      )}
    </EntityIconWrapper>
  );
}

function EntityItemName({ name }) {
  return (
    <h3 className="overflow-hidden">
      <Ellipsified>{name}</Ellipsified>
    </h3>
  );
}

function EntityItemMenu({
  item,
  onPin,
  onMove,
  onCopy,
  onArchive,
  className,
  analyticsContext,
}) {
  const isPinned = item.collection_position != null;
  const showPinnedAction = onPin && isPinned;

  const actions = useMemo(
    () =>
      [
        showPinnedAction && {
          title: isPinned ? t`Unpin this item` : t`Pin this item`,
          icon: "pin",
          action: onPin,
          event: `${analyticsContext};Entity Item;Pin Item;${item.model}`,
        },
        onMove && {
          title: t`Move this item`,
          icon: "move",
          action: onMove,
          event: `${analyticsContext};Entity Item;Move Item;${item.model}`,
        },
        onCopy && {
          title: t`Duplicate this item`,
          icon: "clone",
          action: onCopy,
          event: `${analyticsContext};Entity Item;Copy Item;${item.model}`,
        },
        onArchive && {
          title: t`Archive this item`,
          icon: "archive",
          action: onArchive,
          event: `${analyticsContext};Entity Item;Archive Item;${item.model}`,
        },
      ].filter(action => action),
    [
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
      {!isPinned && <PinButton icon="pin" onClick={onPin} />}
      <EntityMenu
        className={cx(className, "hover-child")}
        triggerIcon="ellipsis"
        items={actions}
      />
    </EntityMenuContainer>
  );
}

const ENTITY_ITEM_SPACING = {
  list: {
    px: 2,
    py: 2,
  },
  small: {
    px: 2,
    py: 1,
  },
};

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
  const spacing = ENTITY_ITEM_SPACING[variant] || { py: 2 };

  return (
    <EntityItemWrapper
      {...spacing}
      className={cx("hover-parent hover--visibility", {
        "bg-light-hover": variant === "list",
      })}
      disabled={disabled}
    >
      <EntityIconCheckBox
        item={item}
        variant={variant}
        iconName={iconName}
        pinned={pinned}
        selectable={selectable}
        selected={selected}
        disabled={disabled}
        onToggleSelected={onToggleSelected}
        style={{
          marginRight: "16px",
        }}
      />

      <Box>
        <EntityItemName name={name} />
        <Box>{extraInfo && extraInfo}</Box>
      </Box>

      <Flex ml="auto" pr={1} align="center" onClick={e => e.preventDefault()}>
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
      </Flex>
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
