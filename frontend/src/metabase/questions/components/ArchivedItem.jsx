/* eslint "react/prop-types": "warn" */

import React, { PropTypes } from "react";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

const ArchivedItem = ({ name, display, onUnarchive }) =>
    <div className="flex align-center">
        <Icon
            style={{ color: '#DEEAF1' }}
            name={display}
        />
        { name }
        <Tooltip tooltip="Unarchive this question">
            <Icon
                onClick={onUnarchive}
                className="ml-auto cursor-pointer text-brand-hover"
                name="unarchive"
            />
        </Tooltip>
    </div>

ArchivedItem.propTypes = {
    display:     PropTypes.string.isRequired,
    name:        PropTypes.string.isRequired,
    onUnarchive: PropTypes.func.isRequired
}

export default ArchivedItem;
