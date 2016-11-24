import React, { PropTypes } from "react";

import Icon from "metabase/components/Icon";

const HeaderWithBack = ({ name }) =>
    <div className="flex align-center">
        { /* TODO - is this this the way we should do this? maybe makes more sense to just usa a link to the question index since you can navigate here from other spots potentially */ }
        <div
            className="mr2"
            onClick={() => window.history.back()}
        >
            { /* TODO - this should be an arrow */ }
            <Icon name="chevronleft" />
        </div>
        <h2>{name}</h2>
    </div>

HeaderWithBack.propTypes = {
    name: PropTypes.string.isRequired
}

export default HeaderWithBack;
