/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import cx from "classnames";

const Code = ({ children, block, style, className }) => {
    if (block) {
        return (
            <div className={cx(className, "text-code")} style={style}>
                {children}
            </div>
        );
    } else if (typeof children === "string" && children.split(/\n/g).length > 1) {
        return (
            <span className={className} style={style}>
                {children.split(/\n/g).map((line, index) => [
                    <span className="text-code" style={{ lineHeight: "1.8em" }}>{line}</span>,
                    <br />
                ])}
            </span>
        );
    } else {
        return (
            <span className={cx(className, "text-code")} style={style}>
                {children}
            </span>
        );
    }
}

Code.propTypes = {
    children: PropTypes.any.isRequired,
    block: PropTypes.bool,
    style: PropTypes.object,
    className: PropTypes.string
}

export default Code;
