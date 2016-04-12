import React, { Component, PropTypes } from "react";

import LabelIcon from "./LabelIcon.jsx";
import Icon from "metabase/components/Icon.jsx";

const LabelPopoverContent = ({ labels, count, item, setLabeled }) =>
    <div>
        { count > 1 ?
            <div>Apply labels to {count} questions</div>
        :
            <div>Label as</div>
        }
        <ul>
            { labels.map(label =>
                (item && item.labels.indexOf(label) >= 0 || label.selected === true) ?
                    <li key={label.id} onClick={() => setLabeled(item && item.id, label.id, false)}>
                        <Icon name="check" />
                        {label.name}
                    </li>
                : (!item && label.selected === null) ?
                    <li key={label.id} onClick={() => setLabeled(item && item.id, label.id, false)}>
                        <Icon name="close" />
                        {label.name}
                    </li>
                :
                    <li key={label.id} onClick={() => setLabeled(item && item.id, label.id, true)}>
                        <LabelIcon icon={label.icon} />
                        {label.name}
                    </li>
            ) }
        </ul>
    </div>

export default LabelPopoverContent;
