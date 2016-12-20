import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

const CollectionActions = ({ actions }) =>
    <div>
        {actions.map(({ action, icon, name, to }, index) =>
            <Tooltip tooltip={name} key={index} >
                { action ?
                    <Icon
                        className="cursor-pointer text-brand-hover mx2"
                        name={icon}
                        onClick={action}
                    />
                :
                    <Link to={to}>
                        <Icon
                            className="cursor-pointer text-brand-hover mx2"
                            name={icon}
                        />
                    </Link>
                }
            </Tooltip>
        )}
    </div>

export default CollectionActions;
