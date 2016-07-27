/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import S from "./LabelPicker.css";

import LabelIcon from "metabase/components/LabelIcon.jsx";
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

const LabelPicker = ({ labels, count, item, setLabeled }) =>
    <div className={S.picker}>
        <div className={S.heading}>
        { count > 1 ?
            "Apply labels to " + count + " questions"
        :
            "Label as"
        }
        </div>
        <ul className={S.options}>
            { labels.map(label => {
                let color = label.icon.charAt(0) === "#" ? label.icon : undefined;
                let selected = item && item.labels.indexOf(label) >= 0 || label.selected === true;
                let partiallySelected = !item && label.selected === null;
                return (
                    <li
                        key={label.id}
                        onClick={() => setLabeled(item && item.id, label.id, !selected, !item)}
                        className={cx(S.option, { [S.selected]: selected })}
                        style={{ color: color }}
                    >
                        <div className={S.optionContent}>
                            { selected ?
                                <Icon className={S.mainIcon} name="check" />
                            : partiallySelected ?
                                <Icon className={S.mainIcon} name="close" />
                            :
                                <LabelIcon className={S.mainIcon} icon={label.icon} />
                            }
                            <span className={S.name}>{label.name}</span>
                            { selected && <Icon className={S.removeIcon} name="close" /> }
                        </div>
                        <div className={S.optionBackground}></div>
                    </li>
                )
            }) }
        </ul>
    </div>

LabelPicker.propTypes = {
    labels:     PropTypes.array.isRequired,
    count:      PropTypes.number,
    item:       PropTypes.object,
    setLabeled: PropTypes.func.isRequired,
};

export default LabelPicker;
