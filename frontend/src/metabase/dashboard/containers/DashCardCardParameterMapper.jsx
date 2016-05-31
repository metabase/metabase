/* @flow */

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import { getEditingParameter, getParameterTarget, makeGetParameterMappingOptions } from "../selectors";
import { fetchDatabaseMetadata } from "../metadata";
import { setParameterMapping } from "../dashboard";

import type { CardObject } from "metabase/meta/types/Card";
import type { DashCardObject, ParameterId, ParameterObject, ParameterMappingOption, ParameterMappingTarget } from "metabase/meta/types/Dashboard";
import type { DatabaseId } from "metabase/meta/types/base";

const makeMapStateToProps = () => {
    const getParameterMappingOptions = makeGetParameterMappingOptions()
    const mapStateToProps = (state, props) => ({
        parameter:      getEditingParameter(state),
        mappingOptions: getParameterMappingOptions(state, props),
        target:         getParameterTarget(state, props)
    });
    return mapStateToProps;
}

const mapDispatchToProps = {
    setParameterMapping,
    fetchDatabaseMetadata
};

@connect(makeMapStateToProps, mapDispatchToProps)
export default class DashCardParameterMapping extends Component {
    props: {
        card: CardObject,
        dashcard: DashCardObject,
        parameter: ParameterObject,
        target: ParameterMappingTarget,
        mappingOptions: Array<ParameterMappingOption>,
        fetchDatabaseMetadata: (id: ?DatabaseId) => void,
        setParameterMapping: (parameter_id: ParameterId, dashcard_id: number, card_id: number, target: ParameterMappingTarget) => void,
    };

    static propTypes = {
        dashcard: PropTypes.object.isRequired,
        card: PropTypes.object.isRequired
    };
    static defaultProps = {};

    componentDidMount() {
        const { card } = this.props;
        this.props.fetchDatabaseMetadata(card.dataset_query.database);
    }

    render() {
        const { mappingOptions, parameter, dashcard, card, target, setParameterMapping } = this.props;
        return (
            <select className="m1" value={JSON.stringify(target)||""} onChange={(e) => setParameterMapping(parameter.id, dashcard.id, card.id, JSON.parse(e.target.value))}>
                <option value=""></option>
                {mappingOptions.map(mappingOption =>
                    <option value={JSON.stringify(mappingOption.target)}>{mappingOption.name}</option>
                )}
            </select>
        );
    }
}
