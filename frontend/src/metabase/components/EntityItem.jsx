import React from "react";
import { t } from "c-3po";
import cx from "classnames";
import { Flex } from "grid-styled";

import EntityMenu from "metabase/components/EntityMenu";
import Swapper from "metabase/components/Swapper";
import IconWrapper from "metabase/components/IconWrapper";
import CheckBox from "metabase/components/CheckBox";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";

import colors from "metabase/lib/colors";

const EntityItemWrapper = Flex.extend`
  border-bottom: 1px solid ${colors["bg-medium"]};
  /* TODO - figure out how to use the prop instead of this? */
  align-items: center;
  &:hover {
    color: ${colors["brand"]};
  }
`;

const EntityItem = ({
  name,
  iconName,
  iconColor,
  isFavorite,
  onPin,
  onFavorite,
  onMove,
  onArchive,
  selected,
  onToggleSelected,
  selectable,
  variant,
}) => {
  const actions = [
    onPin && {
      title: t`Pin this item`,
      icon: "pin",
      action: onPin,
    },
    onMove && {
      title: t`Move this item`,
      icon: "move",
      action: onMove,
    },
    onArchive && {
      title: t`Archive`,
      icon: "archive",
      action: onArchive,
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
      <h3>
        <Ellipsified>{name}</Ellipsified>
      </h3>

      <Flex ml="auto" align="center" onClick={e => e.preventDefault()}>
        {(onFavorite || isFavorite) && (
          <Icon
            name={isFavorite ? "star" : "staroutline"}
            mr={1}
            className={isFavorite ? "text-gold" : "hover-child"}
            onClick={onFavorite}
          />
        )}
        {actions.length > 0 && (
          <EntityMenu
            className="hover-child"
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
