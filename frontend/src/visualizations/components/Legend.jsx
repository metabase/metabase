import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./Legend.css";

import Tooltip from "metabase/components/Tooltip.jsx";

import LegendItem from "./LegendItem.jsx";

import cx from "classnames";

export default class Legend extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            overflowCount: 0,
            size: null
        };
    }

    static propTypes = {};
    static defaultProps = {};

    componentDidUpdate() {
        if (this.props.type === "vertical") {
            let size = ReactDOM.findDOMNode(this).getBoundingClientRect();
            if (this.state.size && (size.width !== this.state.size.width || size.height !== this.state.size.height)) {
                this.setState({ overflowCount: 0, size });
            } else if (this.state.overflowCount === 0) {
                let overflowCount = 0;
                for (var i = 0; i < this.props.titles.length; i++) {
                    let itemSize = this.refs["item"+i].getBoundingClientRect();
                    if (size.top > itemSize.top || size.bottom < itemSize.bottom) {
                        overflowCount++;
                    }
                }
                if (this.state.overflowCount !== overflowCount) {
                    this.setState({ overflowCount, size });
                }
            }
        }
    }

    render() {
        const { type, className, titles, colors, hovered, onHoverChange } = this.props;
        const { overflowCount } = this.state;
        let items, extraItems, extraColors;
        if (overflowCount > 0) {
            items = titles.slice(0, -overflowCount - 1);
            extraItems = titles.slice(-overflowCount - 1);
            extraColors = colors.slice(-overflowCount - 1).concat(colors.slice(0, -overflowCount - 1));
        } else {
            items = titles;
        }
        return (
            <ol ref="container" className={cx(className, styles.Legend, styles[type])}>
                {items.map((title, index) =>
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
                {overflowCount > 0 ?
                    <li key="extra">
                        <Tooltip tooltip={<Legend className="p2" type="vertical" titles={extraItems} colors={extraColors} />}>
                            <div className="inline-block">
                                <LegendItem title={(overflowCount + 1) + " more"} color="grey" showTooltip={false} />
                            </div>
                        </Tooltip>
                    </li>
                : null }
            </ol>
        );
    }
}
