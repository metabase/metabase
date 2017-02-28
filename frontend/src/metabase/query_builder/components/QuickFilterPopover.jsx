import React from "react";

import Popover from "metabase/components/Popover.jsx";
import { TYPE, isa } from "metabase/lib/types";

function getFiltersForColumn(column) {
    if (isa(column.base_type, TYPE.Number) || isa(column.base_type, TYPE.DateTime)) {
        return [
            { name: "<", value: "<" },
            { name: "=", value: "=" },
            { name: "≠", value: "!=" },
            { name: ">", value: ">" }
        ];
    } else {
        return [
            { name: "=", value: "=" },
            { name: "≠", value: "!=" }
        ];
    }
}

const QuickFilterPopover = ({ onFilter, onClose, column }) =>
    <Popover
        hasArrow={false}
        tetherOptions={{
            targetAttachment: "middle center",
            attachment: "middle center"
        }}
        onClose={onClose}
    >
        <div className="bg-white bordered shadowed p1">
            <ul className="h1 flex align-center">
                { getFiltersForColumn(column).map(({ name, value }) =>
                    <li key={value} className="p2 text-brand-hover" onClick={() => onFilter(value)}>{name}</li>
                )}
            </ul>
        </div>
    </Popover>

export default QuickFilterPopover;
