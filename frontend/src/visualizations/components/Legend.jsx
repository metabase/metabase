import React, { Component, PropTypes } from "react";
import styles from "./Legend.css";

import LegendItem from "./LegendItem.jsx";

import cx from "classnames";

const Legend = ({ type, className, titles, colors, hovered, onHoverChange }) =>
    <ol className={cx(className, styles.Legend, styles[type])}>
        {titles.map((title, index) =>
            <li key={index}>
                <LegendItem
                    title={title}
                    color={colors[index % colors.length]}
                    isMuted={hovered && hovered.index != null && index !== hovered.index}
                    onMouseEnter={() => onHoverChange && onHoverChange({ index })}
                    onMouseLeave={() => onHoverChange && onHoverChange(null) }
                />
            </li>
        )}
    </ol>

export default Legend;
