import React, { Component, PropTypes } from "react";

import AccordianList from "./AccordianList.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import TimeGroupingPopover from "./TimeGroupingPopover.jsx";
import QueryDefinitionTooltip from "./QueryDefinitionTooltip.jsx";

import { isDate, getFieldType, DATE_TIME, NUMBER, STRING, LOCATION, COORDINATE } from 'metabase/lib/schema_metadata';
import { parseFieldBucketing, parseFieldTarget } from "metabase/lib/query_time";
import { stripId, singularize } from "metabase/lib/formatting";

import _ from "underscore";

const ICON_MAPPING = {
    [DATE_TIME]:  'calendar',
    [LOCATION]: 'location',
    [COORDINATE]: 'location',
    [STRING]: 'string',
    [NUMBER]: 'int'
};

export default class FieldList extends Component {
    constructor(props, context) {
        super(props, context);

        _.bindAll(this, "onChange", "itemIsSelected", "renderItemExtra", "renderItemIcon", "renderSectionIcon", "getItemClasses");
    }

    static propTypes = {
        field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
        fieldOptions: PropTypes.object.isRequired,
        segmentOptions: PropTypes.array,
        tableName: PropTypes.string,
        onFieldChange: PropTypes.func.isRequired,
        onFilterChange: PropTypes.func,
        enableTimeGrouping: PropTypes.bool,
        tableMetadata: PropTypes.object.isRequired
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        let { tableMetadata, field, fieldOptions, segmentOptions } = newProps;
        let tableName = tableMetadata.display_name;

        let specialOptions = [];
        if (segmentOptions) {
            specialOptions = segmentOptions.map(segment => ({
                name: segment.name,
                value: ["SEGMENT", segment.id],
                segment: segment
            }));
        }

        let mainSection = {
            name: singularize(tableName),
            items: specialOptions.concat(fieldOptions.fields.map(field => ({
                name: field.display_name,
                value: field.id,
                field: field
            })))
        };

        let fkSections = fieldOptions.fks.map(fk => ({
            name: stripId(fk.field.display_name),
            items: fk.fields.map(field => ({
                name: field.display_name,
                value: ["fk->", fk.field.id, field.id],
                field: field
            }))
        }));

        let sections = [mainSection].concat(fkSections);
        let fieldTarget = parseFieldTarget(field);

        this.setState({ sections, fieldTarget });
    }

    itemIsSelected(item) {
        return _.isEqual(this.state.fieldTarget, item.value);
    }

    renderItemExtra(item) {
        let { field, enableTimeGrouping } = this.props;

        return (
            <div className="flex align-center">
                { item.segment &&
                    this.renderSegmentTooltip(item.segment)
                }
                { item.field && enableTimeGrouping && isDate(item.field) &&
                    <PopoverWithTrigger
                        className={this.props.className}
                        hasArrow={false}
                        triggerElement={this.renderTimeGroupingTrigger(field)}
                        tetherOptions={{
                            attachment: 'top left',
                            targetAttachment: 'top right',
                            targetOffset: '0 0',
                            constraints: [{ to: 'window', attachment: 'together', pin: ['left', 'right']}]
                        }}
                    >
                        <TimeGroupingPopover
                            field={field}
                            value={item.value}
                            onFieldChange={this.props.onFieldChange}
                        />
                    </PopoverWithTrigger>
                }
            </div>
        );
    }

    renderItemIcon(item) {
        let name;
        if (item.segment) {
            name = "star-outline";
        } else if (item.field) {
            name = ICON_MAPPING[getFieldType(item.field)]
        }
        return <Icon name={name || 'unknown'} width={18} height={18} />;
    }

    renderTimeGroupingTrigger(field) {
        return (
            <div className="FieldList-grouping-trigger flex align-center p1 cursor-pointer">
                <h4 className="mr1">by {parseFieldBucketing(field).split("-").join(" ")}</h4>
                <Icon name="chevronright" width={16} height={16} />
            </div>
        );
    }

    renderSegmentTooltip(segment) {
        let { tableMetadata } = this.props;
        return (
            <div className="p1">
                <Tooltip tooltip={<QueryDefinitionTooltip object={segment} tableMetadata={tableMetadata} />}>
                    <span className="QuestionTooltipTarget" />
                </Tooltip>
            </div>
        );
    }

    getItemClasses(item, itemIndex) {
        if (item.segment) {
            return "List-item--segment"
        } else {
            return null;
        }
    }

    renderSectionIcon(section, sectionIndex) {
        if (sectionIndex > 0) {
            return <Icon name="connections" width={18} height={18} />
        } else {
            return <Icon name="table2" width={18} height={18} />;
        }
    }

    onChange(item) {
        if (item.segment) {
            this.props.onFilterChange(item.value);
        } else {
            this.props.onFieldChange(item.value);
        }
    }

    render() {
        return (
            <AccordianList
                className={this.props.className}
                sections={this.state.sections}
                onChange={this.onChange}
                itemIsSelected={this.itemIsSelected}
                renderSectionIcon={this.renderSectionIcon}
                renderItemExtra={this.renderItemExtra}
                renderItemIcon={this.renderItemIcon}
                getItemClasses={this.getItemClasses}
            />
        )
    }
}
