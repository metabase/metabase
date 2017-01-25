import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Tooltip from "metabase/components/Tooltip.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";

import cx from "classnames";

// Don't use a <a> tag if there's no href
const LegendLink = (props) =>
    props.href ? <a {...props} /> : <span {...props} />

export default class LegendItem extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {
        showDot: true,
        showTitle: true,
        isMuted: false,
        showTooltip: true,
        showDotTooltip: true
    };

    render() {
        const { title, href, color, showDot, showTitle, isMuted, showTooltip, showDotTooltip, onMouseEnter, onMouseLeave, className } = this.props;
        return (
            <LegendLink
                href={href}
                className={cx(className, "LegendItem", "no-decoration flex align-center fullscreen-normal-text fullscreen-night-text", { mr1: showTitle, muted: isMuted })}
                style={{ overflowX: "hidden", flex: "0 1 auto" }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
            >
                { showDot &&
                    <Tooltip tooltip={title} isEnabled={showTooltip && showDotTooltip}>
                        <div
                            className={cx("flex-no-shrink", "inline-block circular")}
                            style={{width: 13, height: 13, margin: 4, marginRight: 8, backgroundColor: color }}
                        />
                    </Tooltip>
                }
                { showTitle &&
                    <Ellipsified showTooltip={showTooltip}>{title}</Ellipsified>
                }
            </LegendLink>
        );
    }
}
