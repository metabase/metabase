import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import S from "./DashCardCardParameterMapper.css";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";
import AccordianList from "metabase/components/AccordianList.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import { getEditingParameter, getParameterTarget, makeGetParameterMappingOptions, getMappingsByParameter } from "../selectors";
import { fetchDatabaseMetadata } from "../metadata";
import { setParameterMapping } from "../dashboard";

import _ from "underscore";
import cx from "classnames";
import { getIn } from "icepick";

import type { CardObject } from "metabase/meta/types/Card";
import type { DashCardObject, ParameterId, ParameterObject, ParameterMappingOption, ParameterMappingTarget } from "metabase/meta/types/Dashboard";
import type { DatabaseId } from "metabase/meta/types/base";

const makeMapStateToProps = () => {
    const getParameterMappingOptions = makeGetParameterMappingOptions()
    const mapStateToProps = (state, props) => ({
        parameter:           getEditingParameter(state),
        mappingOptions:      getParameterMappingOptions(state, props),
        mappingOptionSections: _.groupBy(getParameterMappingOptions(state, props), "sectionName"),
        target:              getParameterTarget(state, props),
        mappingsByParameter: getMappingsByParameter(state)
    });
    return mapStateToProps;
}

const mapDispatchToProps = {
    setParameterMapping,
    fetchDatabaseMetadata
};

@connect(makeMapStateToProps, mapDispatchToProps)
export default class DashCardCardParameterMapper extends Component {
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

    onChange = (item) => {
        const { setParameterMapping, parameter, dashcard, card } = this.props;
        setParameterMapping(parameter.id, dashcard.id, card.id, item && item.target);
        this.refs.popover.close()
    }

    render() {
        const { mappingOptions, target, mappingsByParameter, parameter, dashcard, card } = this.props;
        const selected = _.find(mappingOptions, (o) => _.isEqual(o.target, target));

        const mapping = getIn(mappingsByParameter, [parameter.id, dashcard.id, card.id]);
        let overlapWarning = mapping && mapping.mappingsWithValues > 1 && mapping.overlapMax === 1;

        const sections = _.map(this.props.mappingOptionSections, (options) => ({
            name: options[0].sectionName,
            icon: options[0].sectionIcon,
            items: options
        }));

        return (
            <div onMouseDown={(e) => e.stopPropagation()}>
                <PopoverWithTrigger
                    ref="popover"
                    triggerElement={
                        <Tooltip isEnabled={overlapWarning} tooltip="The values in this field don't overlap with the values of any other fields you've chosen" verticalAttachments={["bottom", "top"]}>
                            <button className={cx(S.button, { [S.mapped]: !!selected, [S.warn]: overlapWarning })}>
                                <span className="mr1">{selected ? selected.name : "Select..."}</span>
                                { selected ?
                                    <Icon className="flex-align-right" name="close" width={16} height={16} onClick={(e) => { this.onChange(null); e.stopPropagation(); }}/>
                                :
                                    <Icon className="flex-align-right" name="chevrondown" width={16} height={16} />
                                }
                            </button>
                        </Tooltip>
                    }
                >
                <AccordianList
                    className="text-brand"
                    sections={sections}
                    onChange={this.onChange}
                    itemIsSelected={(item) => _.isEqual(item.target, target)}
                    renderItemIcon={(item) => <Icon name={item.icon} width={18} height={18} />}
                    renderSectionIcon={(section) => <Icon name={section.icon} width={18} height={18} />}
                />
                </PopoverWithTrigger>
            </div>
        );
    }
}
