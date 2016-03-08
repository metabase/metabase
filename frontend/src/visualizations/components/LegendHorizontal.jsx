import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./Legend.css";

import LegendItem from "./LegendItem.jsx";

import cx from "classnames";

export default class LegendHorizontal extends Component {
    render() {
        const { className, titles, colors, hovered, onHoverChange } = this.props;
        return (
            <ol ref="container" className={cx(className, styles.Legend, styles.horizontal)}>
                {titles.map((title, index) =>
                    <li ref={"item"+index} key={index}>
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
        );
    }
}
