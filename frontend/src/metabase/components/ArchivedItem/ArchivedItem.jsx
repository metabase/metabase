/* eslint "react/prop-types": "warn" */

import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import CheckBox from "metabase/core/components/CheckBox";
import { Icon } from "metabase/core/components/Icon";
import Swapper from "metabase/core/components/Swapper";
import Tooltip from "metabase/core/components/Tooltip";

import { color as c } from "metabase/lib/colors";
import { ItemIcon, ItemIconContainer } from "./ArchivedItem.styled";

const ArchivedItem = ({
  name,
  type,
  icon,
  color = c("text-light"),
  isAdmin = false,
  onUnarchive,
  onDelete,
  selected,
  onToggleSelected,
  showSelect,
}) => (
  <div
    className="flex align-center p2 hover-parent hover--visibility border-bottom bg-light-hover"
    data-testid={`archive-item-${name}`}
  >
    <Swapper
      defaultElement={
        <ItemIconContainer>
          <ItemIcon name={icon} color={color} />
        </ItemIconContainer>
      }
      swappedElement={
        <ItemIconContainer>
          <CheckBox checked={selected} onChange={onToggleSelected} />
        </ItemIconContainer>
      }
      isSwapped={showSelect}
    />
    {name}
    {isAdmin && (onUnarchive || onDelete) && (
      <span className="ml-auto mr2">
        {onUnarchive && (
          <Tooltip tooltip={t`Unarchive this ${type}`}>
            <Icon
              onClick={onUnarchive}
              className="cursor-pointer text-brand-hover hover-child ml4"
              name="unarchive"
            />
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip tooltip={t`Delete this ${type}`}>
            <Icon
              onClick={onDelete}
              className="cursor-pointer text-brand-hover hover-child ml4"
              name="trash"
            />
          </Tooltip>
        )}
      </span>
    )}
  </div>
);

ArchivedItem.propTypes = {
  name: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  color: PropTypes.string,
  isAdmin: PropTypes.bool,
  onUnarchive: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,

  selected: PropTypes.bool.isRequired,
  onToggleSelected: PropTypes.func.isRequired,
  showSelect: PropTypes.bool.isRequired,
};

export default ArchivedItem;
