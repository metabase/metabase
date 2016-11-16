import React from "react";

import Tooltip from "metabase/components/Tooltip.jsx";
import Icon from "metabase/components/Icon.jsx";

const Warnings = ({ warnings, className, size = 16 }) => {
    if (!warnings || warnings.length === 0) {
        return null;
    }
    const tooltip = (
        <ul className="px2 pt2 pb1">
            {warnings.map((warning) =>
                <li className="pb1" key={warning}>
                    <Icon name="warning" size={16} />
                    <span className="pl1">{warning}</span>
                </li>
            )}
        </ul>
    );

    return (
        <Tooltip tooltip={tooltip}>
            <Icon className={className} name="warning" size={size} />
        </Tooltip>
    )
}


export default Warnings;
