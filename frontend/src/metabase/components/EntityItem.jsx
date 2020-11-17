import React from "react";
import { t } from "ttag";
import cx from "classnames";
import { Box, Flex } from "grid-styled";

import EntityMenu from "metabase/components/EntityMenu";
import Swapper from "metabase/components/Swapper";
import IconWrapper from "metabase/components/IconWrapper";
import CheckBox from "metabase/components/CheckBox";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

const EntityItemWrapper = Flex.extend`
  border-bottom: 1px solid ${color("bg-medium")};
  /* TODO - figure out how to use the prop instead of this? */
  align-items: center;
  &:hover {
    color: ${color("brand")};
  }
`;

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
}) => {
  const actions = [
    onPin && {
      title: t`Pin this item`,
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
  ].filter(action => action);

  let spacing;

  switch (variant) {
    case "list":
      spacing = {
        px: 2,
        py: 2,
      };
      break;
    default:
      spacing = {
        py: 2,
      };
      break;
  }

  return (
    <EntityItemWrapper
      {...spacing}
      className={cx("hover-parent hover--visibility", {
        "bg-light-hover": variant === "list",
      })}
    >
      <IconWrapper
        p={1}
        mr={2}
        align="center"
        justify="center"
        onClick={
          selectable
            ? e => {
                e.preventDefault();
                onToggleSelected();
              }
            : null
        }
      >
        {selectable ? (
          <Swapper
            startSwapped={selected}
            defaultElement={
              <Icon name={iconName} color={iconColor} size={18} />
            }
            swappedElement={<CheckBox checked={selected} size={18} />}
          />
        ) : (
          <Icon name={iconName} color={iconColor} size={18} />
        )}
      </IconWrapper>
      <Box>
        <h3 className="overflow-hidden">
          <Ellipsified>{name}</Ellipsified>
        </h3>
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
        {actions.length > 0 && (
          <EntityMenu
            className="ml1 hover-child"
            triggerIcon="ellipsis"
            items={actions}
          />
        )}
      </Flex>
    </EntityItemWrapper>
  );
};

EntityItem.defaultProps = {
  selectable: false,
};

export default EntityItem;
