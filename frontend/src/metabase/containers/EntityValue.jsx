import React, { Component } from "react";
import { connect } from "react-redux";
import { getIn } from "icepick";

// import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import cx from "classnames";

import { TYPE, isa } from "metabase/lib/types";
import { requestEntityNames } from "metabase/redux/entitynames";

import "./EntityValue.css";

function getColumnEntityIdField(column) {
    if (!column) {
        return null;
    // } else if (isa(column.special_type, TYPE.PK)) {
    //     return column.id;
    } else if (isa(column.special_type, TYPE.FK) && column.target) {
        return column.target.id;
    }
    return null;
}

const getEntity = (state, { value, column }) => {
    let entityIdField = getColumnEntityIdField(column);
    if (entityIdField != null) {
        return getIn(state, ["entitynames", "entitiesByField", entityIdField, value])
    }
}

const mapStateToProps = (state, props) => ({
    entity: getEntity(state, props),
    entitiesByField: state.entitynames.entitiesByField
});

const mapDispatchToProps = {
    requestEntityNames
};

let pendingRequests = new Map()
let pendingTimeout;

const getName = (props) => props.entity && props.entity.name ? props.entity.name : props.value;

@connect(mapStateToProps, mapDispatchToProps)
export default class EntityValue extends Component {
    // normally this debouncing logic etc would be in redux-land but it needs to be extremely fast
    _loadEntityName(props) {
        const { entitiesByField } = props;
        let entityId = props.value;
        let fieldId = getColumnEntityIdField(props.column);
        if (entityId != null && fieldId != null && getIn(entitiesByField, [fieldId, entityId]) == null) {
            if (!pendingRequests.has(fieldId)) {
                pendingRequests.set(fieldId, new Set())
            }
            pendingRequests.get(fieldId).add(entityId);
            if (pendingTimeout != null) {
                clearTimeout(pendingTimeout);
            }
            pendingTimeout = setTimeout(() => {
                props.requestEntityNames(pendingRequests);
                pendingRequests = new Map();
                pendingTimeout = null;
            }, 100);
        }
    }

    componentWillMount() {
        this._loadEntityName(this.props);
    }

    componentDidUpdate(prevProps) {
        if (this.props.onResize && getName(prevProps) !== getName(this.props)) {
            this.props.onResize();
        }
    }

    componentWillReceiveProps(newProps) {
        if (this.props.column.id !== newProps.column.id || this.props.value !== newProps.value) {
            this._loadEntityName(newProps);
        }
    }

    render() {
        const { value, entity } = this.props;
        const isLoading = entity && entity.state === "loading";
        return (
            <span className={cx({ "EntityValue--loading": isLoading })}>
                {entity && entity.name ? entity.name : value}
            </span>
        )
    }
}
