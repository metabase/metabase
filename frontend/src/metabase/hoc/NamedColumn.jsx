import React, { Component, PropTypes } from "react";

import Popover from "metabase/components/Popover.jsx";

import { NamedClause } from "metabase/lib/query";

import cx from "classnames";

const NamedColumn = ({ valueProp, updaterProp, nameIsEditable }) => (ComposedComponent) => class NamedWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            isHovered: false
        };
    }
    render() {
        const name = NamedClause.getName(this.props[valueProp]);
        const clause = NamedClause.getContent(this.props[valueProp]);

        const props = {
            ...this.props,
            name: name,
            [valueProp]: clause,
            [updaterProp]: (clause) => this.props[updaterProp](name ? ["named", clause, name] : clause)
        };

        const isEditable = this.state.isHovered && this.props[updaterProp] && nameIsEditable(props);

        return (
            <div
                className={cx(this.props.className, "relative")}
                onMouseEnter={() => this.setState({ isHovered: true })}
                onMouseLeave={() => this.setState({ isHovered: false })}
            >
                <ComposedComponent {...props} className="spread" />
                <Popover isOpen={isEditable}>
                    <input
                        className="input m1"
                        value={name || ""}
                        onChange={(e) => this.props[updaterProp](e.target.value ? ["named", clause, e.target.value] : clause)}
                        autoFocus
                    />
                </Popover>
            </div>
        );
    }
}

export default NamedColumn;
