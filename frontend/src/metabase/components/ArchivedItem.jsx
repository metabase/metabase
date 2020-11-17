/* eslint "react/prop-types": "warn" */

import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import CheckBox from "metabase/components/CheckBox";
import Icon from "metabase/components/Icon";
import IconWrapper from "metabase/components/IconWrapper";
import Swapper from "metabase/components/Swapper";
import Tooltip from "metabase/components/Tooltip";

import { color as c } from "metabase/lib/colors";

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
  <div className="flex align-center p2 hover-parent hover--visibility border-bottom bg-light-hover">
    <IconWrapper p={1} mr={1} align="center" justify="center">
      <Swapper
        startSwapped={showSelect}
        defaultElement={<Icon name={icon} color={color} />}
        swappedElement={
          <CheckBox checked={selected} onChange={onToggleSelected} />
        }
      />
    </IconWrapper>
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
