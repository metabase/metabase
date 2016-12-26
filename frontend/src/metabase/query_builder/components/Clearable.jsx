import React from "react";

import Icon from "metabase/components/Icon.jsx";

const Clearable = ({ onClear, children }) =>
    <div className="flex align-center">
        {children}
        { onClear &&
            <a className="text-grey-2 no-decoration pr1 flex align-center" onClick={onClear}>
                <Icon name='close' size={14} />
            </a>
        }
    </div>

export default Clearable;
