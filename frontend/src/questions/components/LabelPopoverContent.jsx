import React, { Component, PropTypes } from "react";
import S from "./LabelPopoverContent.css";

import LabelIcon from "./LabelIcon.jsx";
import Icon from "metabase/components/Icon.jsx";

const LabelPopoverContent = ({ labels, count, item, setLabeled }) =>
    <div className={S.picker}>
        <div className={S.heading}>
        { count > 1 ?
            "Apply labels to " + count + " questions"
        :
            "Label as"
        }
        </div>
        <ul className={S.options}>
            { labels.map(label =>
                (item && item.labels.indexOf(label) >= 0 || label.selected === true) ?
                    <li key={label.id} className={S.option + " " + S.selected} onClick={() => setLabeled(item && item.id, label.id, false)}>
                        <Icon className={S.mainIcon} name="check" />
                        {label.name}
                        <Icon className={S.removeIcon} name="close" />
                    </li>
                : (!item && label.selected === null) ?
                    <li key={label.id} className={S.option} onClick={() => setLabeled(item && item.id, label.id, false)}>
                        <Icon className={S.mainIcon} name="close" />
                        {label.name}
                    </li>
                :
                    <li key={label.id} className={S.option} onClick={() => setLabeled(item && item.id, label.id, true)}>
                        <LabelIcon className={S.mainIcon} icon={label.icon} />
                        {label.name}
                    </li>
            ) }
        </ul>
    </div>

export default LabelPopoverContent;
