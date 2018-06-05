/* eslint "react/prop-types": "warn" */

import React from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import CheckBox from "metabase/components/CheckBox.jsx";
import { Box } from "rebass";
import cx from "classnames";

const ArchivedItem = ({
  name,
  type,
  icon,
  color = "#DEEAF1",
  isAdmin = false,
  onUnarchive,

  selected,
  onToggleSelected,
}) => (
  <div className="flex align-center p2 hover-parent hover--visibility border-bottom bg-grey-0-hover">
    <Box className="hover-parent hover--visibility">
      <Box className="hover-child hover-child--hiden">
        <Icon name={icon} className="mr2" style={{ color: color }} size={20} />
      </Box>
      {onToggleSelected && (
        <Box className={cx({ "hover-child": !selected })}>
          <CheckBox checked={selected} onChange={onToggleSelected} />
        </Box>
      )}
    </Box>
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
};

export default ArchivedItem;
