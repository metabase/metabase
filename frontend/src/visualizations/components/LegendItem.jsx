import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./Legend.css";

import Tooltip from "metabase/components/Tooltip.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";

import cx from "classnames";

const LegendItem = ({ title, href, color, showDot = true, showTitle = true, isMuted = false, showTooltip = true, onMouseEnter, onMouseLeave, className }) =>
    <a
        href={href}
        className={cx(styles.LegendItem, className, "no-decoration h3 text-bold flex align-center", { mr1: showTitle, muted: isMuted })}
        style={{ overflowX: "hidden", flex: "0 1 auto" }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
    >
        { showDot &&
            <Tooltip tooltip={title} isEnabled={showTooltip}>
                <div
                    className={cx("flex-no-shrink", "inline-block circular")}
                    style={{width: 13, height: 13, margin: 4, marginRight: 8, backgroundColor: color }}
                />
            </Tooltip>
        }
        { showTitle &&
            <Ellipsified showTooltip={showTooltip}>{title}</Ellipsified>
        }
    </a>


export default LegendItem;
