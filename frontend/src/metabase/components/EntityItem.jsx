/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import { t } from "ttag";
import cx from "classnames";
import { Box, Flex } from "grid-styled";

import EntityMenu from "metabase/components/EntityMenu";
import Swapper from "metabase/components/Swapper";
import IconWrapper from "metabase/components/IconWrapper";
import CheckBox from "metabase/components/CheckBox";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";

import { color, lighten } from "metabase/lib/colors";

const EntityItemWrapper = Flex.extend`
  border-bottom: 1px solid ${color("bg-medium")};
  /* TODO - figure out how to use the prop instead of this? */
  align-items: center;
  &:hover {
    color: ${color("brand")};
  }
`;

function getPinnedBackground(model) {
  return model === "dashboard"
    ? color("accent4")
    : lighten(color("accent4"), 0.28);
}

function getPinnedForeground(model) {
  return model === "dashboard" ? color("white") : color("accent4");
}

function getBackground(model) {
  return model === "dashboard" ? color("brand") : color("brand-light");
}

function getForeground(model) {
  return model === "dashboard" ? color("white") : color("brand");
}

function EntityItemIcon({
  item,
  variant,
  iconName,
  pinned,
  selectable,
  selected,
  onToggleSelected,
  ...props
}) {
  const iconSize = variant === "small" ? 12 : 18;
  const handleClick = e => {
    e.preventDefault();
    onToggleSelected();
  };

  return (
    <IconWrapper
      p={"12px 13px"}
      mr={2}
      bg={pinned ? getPinnedBackground(item.model) : getBackground(item.model)}
      color={
        pinned ? getPinnedForeground(item.model) : getForeground(item.model)
      }
      borderRadius={"99px"}
      onClick={selectable ? handleClick : null}
      {...props}
    >
      {selectable ? (
        <Swapper
          startSwapped={selected}
          defaultElement={
            <Icon name={iconName} color={"inherit"} size={iconSize} />
          }
          swappedElement={<CheckBox checked={selected} size={iconSize} />}
        />
      ) : (
        <Icon name={iconName} color={"inherit"} size={iconSize} />
      )}
    </IconWrapper>
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
  analyticsContext,
}) {
  const actions = useMemo(
    () =>
      [
        onPin && {
          title:
            item.collection_position != null
              ? t`Unpin this item`
              : t`Pin this item`,
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
    [item, onPin, onMove, onCopy, onArchive, analyticsContext],
  );
  if (actions.length === 0) {
    return null;
  }
  return (
    <EntityMenu
      className="ml1 hover-child"
      triggerIcon="ellipsis"
      items={actions}
    />
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
  iconColor,
  isFavorite,
  onPin,
  onFavorite,
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
}) => {
  const spacing = ENTITY_ITEM_SPACING[variant] || { py: 2 };

  return (
    <EntityItemWrapper
      {...spacing}
      className={cx("hover-parent hover--visibility", {
        "bg-light-hover": variant === "list",
      })}
    >
      <EntityItemIcon
        item={item}
        variant={variant}
        iconName={iconName}
        pinned={pinned}
        selectable={selectable}
        selected={selected}
        onToggleSelected={onToggleSelected}
      />

      <Box>
        <EntityItemName name={name} />
        <Box>{extraInfo && extraInfo}</Box>
      </Box>

      <Flex ml="auto" pr={1} align="center" onClick={e => e.preventDefault()}>
        {buttons}
        {item.description && (
          <Icon
            tooltip={item.description}
            name="info"
            className="ml1 text-medium"
          />
        )}
        <EntityItemMenu
          item={item}
          onPin={onPin}
          onMove={onMove}
          onCopy={onCopy}
          onArchive={onArchive}
          analyticsContext={analyticsContext}
        />
      </Flex>
    </EntityItemWrapper>
  );
};

EntityItem.defaultProps = {
  selectable: false,
};

EntityItem.Icon = EntityItemIcon;
EntityItem.Name = EntityItemName;
EntityItem.Menu = EntityItemMenu;

export default EntityItem;
