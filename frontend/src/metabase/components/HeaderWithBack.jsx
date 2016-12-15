import React, { PropTypes } from "react";

import Icon from "metabase/components/Icon";

const HeaderWithBack = ({ name }) =>
    <div className="flex align-center">
        { /* TODO - is this this the way we should do this? maybe makes more sense to just usa a link to the question index since you can navigate here from other spots potentially */ }
        <Icon
            className="cursor-pointer text-brand mr2 flex align-center circle p2 bg-light-blue bg-brand-hover text-white-hover transition-background transition-color"
            name="backArrow"
            onClick={() => window.history.back()}
        />
        <h2>{name}</h2>
    </div>

HeaderWithBack.propTypes = {
    name: PropTypes.string.isRequired
}

export default HeaderWithBack;
