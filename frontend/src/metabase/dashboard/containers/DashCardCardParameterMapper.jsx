import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import S from "./DashCardCardParameterMapper.css";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";
import AccordianList from "metabase/components/AccordianList.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";

import { getEditingParameter, getParameterTarget, makeGetParameterMappingOptions, getMappingsByParameter } from "../selectors";
import { setParameterMapping } from "../dashboard";

import _ from "underscore";
import cx from "classnames";
import { getIn } from "icepick";

import type { CardObject } from "metabase/meta/types/Card";
import type { DashCardObject, ParameterId, ParameterObject, ParameterMappingOption, ParameterMappingTarget } from "metabase/meta/types/Dashboard";
import type { DatabaseId } from "metabase/meta/types/Database";

const makeMapStateToProps = () => {
    const getParameterMappingOptions = makeGetParameterMappingOptions()
    const mapStateToProps = (state, props) => ({
        parameter:           getEditingParameter(state, props),
        mappingOptions:      getParameterMappingOptions(state, props),
        mappingOptionSections: _.groupBy(getParameterMappingOptions(state, props), "sectionName"),
        target:              getParameterTarget(state, props),
        mappingsByParameter: getMappingsByParameter(state, props)
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
        const { mappingOptions, mappingOptionSections, target, mappingsByParameter, parameter, dashcard, card } = this.props;

        const disabled = mappingOptions.length === 0;
        const selected = _.find(mappingOptions, (o) => _.isEqual(o.target, target));

        const mapping = getIn(mappingsByParameter, [parameter.id, dashcard.id, card.id]);
        const noOverlap = !!(mapping && mapping.mappingsWithValues > 1 && mapping.overlapMax === 1);

        const hasFkOption = _.any(mappingOptions, (o) => o.isFk);

        const sections = _.map(mappingOptionSections, (options) => ({
            name: options[0].sectionName,
            icon: options[0].sectionIcon,
            items: options
        }));

        let tooltipText = null;
        if (disabled) {
            tooltipText = "This card doesn't have any fields or parameters that can be mapped to this parameter type.";
        } else if (noOverlap) {
            tooltipText = "The values in this field don't overlap with the values of any other fields you've chosen.";
        }

        return (
            <div className="mx1 flex flex-column align-center" onMouseDown={(e) => e.stopPropagation()}>
                { dashcard.series && dashcard.series.length > 0 &&
                    <div className="h5 mb1 text-bold" style={{ textOverflow: "ellipsis", whiteSpace: "nowrap", overflowX: "hidden", maxWidth: 100 }}>{card.name}</div>
                }
                <PopoverWithTrigger
                    ref="popover"
                    triggerClasses={cx({ "disabled": disabled })}
                    triggerElement={
                        <Tooltip tooltip={tooltipText} verticalAttachments={["bottom", "top"]}>
                            {/* using div instead of button due to
                                https://bugzilla.mozilla.org/show_bug.cgi?id=984869
                                and click event on close button not propagating in FF
                            */}
                            <div
                                className={cx(S.button, {
                                    [S.mapped]: !!selected,
                                    [S.warn]: noOverlap,
                                    [S.disabled]: disabled
                                })}
                            >
                                <span className="text-centered mr1">
                                { disabled ?
                                    "No valid fields"
                                : selected ?
                                    selected.name
                                :
                                    "Select…"
                                }
                                </span>
                                { selected ?
                                    <Icon className="flex-align-right" name="close" size={16} onClick={(e) => { this.onChange(null); e.stopPropagation(); }}/>
                                : !disabled ?
                                    <Icon className="flex-align-right" name="chevrondown" size={16} />
                                : null }
                            </div>
                        </Tooltip>
                    }
                >
                    <AccordianList
                        className="text-brand scroll-show scroll-y"
                        style={{ maxHeight: 600 }}
                        sections={sections}
                        onChange={this.onChange}
                        itemIsSelected={(item) => _.isEqual(item.target, target)}
                        renderItemIcon={(item) => <Icon name={item.icon || "unknown"} size={18} />}
                        alwaysExpanded={true}
                        hideSingleSectionTitle={!hasFkOption}
                    />
                </PopoverWithTrigger>
            </div>
        );
    }
}
