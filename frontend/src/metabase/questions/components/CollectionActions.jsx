import React from "react";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

const CollectionActions = ({ actions }) =>
    <div>
        {actions.map(({ action, icon, name }, index) =>
            <Tooltip tooltip={name} key={index} >
                <Icon
                    className="cursor-pointer text-brand-hover ml2"
                    name={icon}
                    onClick={ () => action() }
                />
            </Tooltip>
        )}
    </div>

export default CollectionActions;
