import React from "react";
import { t } from "c-3po";
import EntityMenu from "metabase/components/EntityMenu";
import { Motion, spring } from "react-motion"

import { Flex, Box, Truncate } from "rebass";

import CheckBox from "metabase/components/CheckBox";
import Icon from "metabase/components/Icon";

import { normal } from "metabase/lib/colors";

const EntityItemWrapper = Flex.extend`
  border-bottom: 1px solid #f8f9fa;
  /* TODO - figure out how to use the prop instead of this? */
  align-items: center;
  &:hover {
    color: ${normal.blue};
  }
  &:last-child {
    border-bottom: none;
  }
`;

const IconWrapper = Flex.extend`
  background: #f4f5f6;
  border-radius: 6px;
`;

const EntityItem = ({
  name,
  iconName,
  iconColor,
  item,
  isFavorite,
  onPin,
  onFavorite,
  selected,
  onToggleSelected,
  selectable,
  showSelect
}) => {
  return (
    <EntityItemWrapper py={2} px={2} className="hover-parent hover--visibility">
      <IconWrapper
        p={1}
        mr={1}
        align="center"
        justify="center"
      >
      { selectable ? (
        <Swapper
          startSwapped={showSelect}
          defaultElement={<Icon name={iconName} color={iconColor} />}
          swappedElement={
            <CheckBox
              checked={selected}
              onChange={(ev) => onToggleSelected(ev)}
            />
          }
        />
      ) : (
        <Icon name={iconName} color={iconColor} />
      )}
      </IconWrapper>
      <h3>
        <Truncate>{name}</Truncate>
      </h3>

      <Flex
        ml="auto"
        align="center"
        className="hover-child"
        onClick={e => e.preventDefault()}
      >
        { onFavorite && (
        <Icon
          name={isFavorite ? "star" : "staroutline"}
          mr={1}
          onClick={() => onFavorite(item)}
        />
        )}
        <EntityMenu
          triggerIcon="ellipsis"
          items={[
            {
              title: t`Pin this item`,
              icon: "pin",
              action: () => onPin(item),
            },
            {
              title: t`Move this item`,
              icon: "move",
              action: () => onPin(item),
            },
            {
              title: t`Archive`,
              icon: "archive",
              action: () => {
                try {
                  item.setArchived(true)
                } finally {
                }
              }
            },
          ]}
        />
      </Flex>
    </EntityItemWrapper>
  );
};

class Swapper extends React.Component {
  props: {
    defaultElement: React$Element,
    swappedElement: React$Element
  }

  state = {
    hovered: false
  }

  _onMouseEnter () {
    this.setState({ hovered: true })
  }

  _onMouseLeave () {
    this.setState({ hovered: false })
  }

  render () {
    const { defaultElement, swappedElement, startSwapped } = this.props
    const { hovered } = this.state

    return (
      <span
        onMouseEnter={() => this._onMouseEnter()}
        onMouseLeave={() => this._onMouseLeave()}
        className="block relative"
      >
        <Motion
          defaultStyle={{
            scale: 1
          }}
          style={{
            scale: hovered || startSwapped ? spring(0): spring(1)
          }}
        >
          {({ scale }) => {
            return (
              <span className="" style={{ display: 'block', transform: `scale(${scale})` }}>
                { defaultElement }
              </span>
            )
          }}
        </Motion>
        <Motion
          defaultStyle={{
            scale: 0
          }}
          style={{
            scale: hovered || startSwapped ? spring(1): spring(0)
          }}
        >
          {({ scale }) => {
            return (
              <span className="absolute top left bottom right" style={{ display: 'block', transform: `scale(${scale})` }}>
                { swappedElement }
              </span>
            )
          }}
        </Motion>
      </span>
    )
  }
}

EntityItem.defaultProps = {
  selectable: false
}

export default EntityItem;
