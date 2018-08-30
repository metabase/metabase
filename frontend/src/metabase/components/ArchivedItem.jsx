/* eslint "react/prop-types": "warn" */

import React from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";

import CheckBox from "metabase/components/CheckBox.jsx";
import Icon from "metabase/components/Icon";
import IconWrapper from "metabase/components/IconWrapper";
import Swapper from "metabase/components/Swapper";
import Tooltip from "metabase/components/Tooltip";

import colors from "metabase/lib/colors";

const ArchivedItem = ({
  name,
  type,
  icon,
  color = colors["text-light"],
  isAdmin = false,
  onUnarchive,

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
    {isAdmin && (
      <Tooltip tooltip={t`Unarchive this ${type}`}>
        <Icon
          onClick={onUnarchive}
          className="ml-auto cursor-pointer text-brand-hover hover-child"
          name="unarchive"
        />
      </Tooltip>
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

  selected: PropTypes.bool.isRequired,
  onToggleSelected: PropTypes.func.isRequired,
  showSelect: PropTypes.bool.isRequired,
};

export default ArchivedItem;
