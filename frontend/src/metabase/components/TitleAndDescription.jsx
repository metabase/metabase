import React from 'react';
import PropTypes from "prop-types";
import pure from "recompose/pure";

import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

const TitleAndDescription = ({ title, description }) =>
    <div className="flex align-center">
        <h2 className="mr1">{title}</h2>
        { description &&
            <Tooltip tooltip={description} maxWidth={'22em'}>
                <Icon name='info' style={{ marginTop: 3 }}/>
            </Tooltip>
        }
    </div>;

TitleAndDescription.propTypes = {
    title: PropTypes.string.isRequired,
    description: PropTypes.string
};

export default pure(TitleAndDescription);
