import React, { Component } from "react";
import PropTypes from "prop-types";

import Clearable from "./Clearable.jsx";

import Query from "metabase/lib/query";

import Dimension from "metabase-lib/lib/Dimension";

import cx from "classnames";

export default class FieldName extends Component {
    static propTypes = {
        field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
        onClick: PropTypes.func,
        removeField: PropTypes.func,
        tableMetadata: PropTypes.object.isRequired
    };

    static defaultProps = {
        className: ""
    };

    render() {
        let { field, tableMetadata, className } = this.props;

        let parts = [];

        const dimension = Dimension.parseMBQL(field, tableMetadata && tableMetadata.metadata);
        if (dimension) {
            parts = dimension.render();
        } else {
            parts.push(<span key="field">Unknown Field</span>);
        }

        return (
            <Clearable onClear={this.props.removeField}>
                <div className={cx(className, { selected: Query.isValidField(field) })} onClick={this.props.onClick}>
                    <span className="QueryOption">{parts}</span>
                </div>
            </Clearable>
        );
    }
}
