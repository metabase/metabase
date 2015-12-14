import React, { Component, PropTypes } from "react";

import AccordianList from "./AccordianList.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import TimeGroupingPopover from "./TimeGroupingPopover.jsx";

import FilterList from "./filters/FilterList.jsx";
import FieldSet from "../admin/datamodel/components/FieldSet.jsx";

import { isDate, getFieldType, DATE_TIME, NUMBER, STRING, LOCATION, COORDINATE } from 'metabase/lib/schema_metadata';
import { parseFieldBucketing, parseFieldTarget } from "metabase/lib/query_time";
import { stripId, singularize } from "metabase/lib/formatting";
import Query from "metabase/lib/query";

import _ from "underscore";
import cx from "classnames";

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
        let { tableMetadata, field, fieldOptions, segmentOptions, onFieldChange, onFilterChange } = newProps;
        let tableName = tableMetadata.display_name;

        let specialOptions = [];
        if (segmentOptions) {
            specialOptions = segmentOptions.map(segment => ({
                field: { display_name: segment.name },
                value: ["SEGMENT", segment.id],
                segment: segment,
                onClick: onFilterChange
            }));
        }

        let mainSection = {
            name: singularize(tableName),
            items: specialOptions.concat(fieldOptions.fields.map(field => ({
                field: field,
                value: field.id,
                onClick: onFieldChange
            })))
        };

        let fkSections = fieldOptions.fks.map(fk => ({
            name: stripId(fk.field.display_name),
            items: fk.fields.map(field => ({
                field: field,
                value: ["fk->", fk.field.id, field.id],
                onClick: onFieldChange
            }))
        }));

        let sections = [mainSection].concat(fkSections);
        let fieldTarget = parseFieldTarget(field);

        this.setState({ sections, fieldTarget });
    }

    itemIsSelected(item) {
        return _.isEqual(this.state.fieldTarget, item.value);
    }

    renderItem(item) {
        let { field, tableMetadata, enableTimeGrouping } = this.props;

        if (tableMetadata.db.engine === "mongo") {
            enableTimeGrouping = false
        }

        return (
            <div className="flex-full flex align-center">
                <a className={cx("flex-full flex align-center px1 py1 cursor-pointer", { "List-item--segment": !!item.segment })}
                     onClick={item.onClick.bind(null, item.value)}
                >
                    { this.renderTypeIcon(item) }
                    <h4 className="List-item-title ml2">{item.field.display_name}</h4>
                </a>
                { item.segment &&
                    this.renderSegmentTooltip(item.segment)
                }
                { enableTimeGrouping && isDate(item.field) &&
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
                            onFieldChange={item.onClick}
                        />
                    </PopoverWithTrigger>
                }
            </div>
        );
    }

    renderTypeIcon(item) {
        let name;
        if (item.segment) {
            name = "star-outline";
        } else {
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
        )
    }

    renderSegmentTooltip(segment) {
        let { tableMetadata } = this.props;
        let tooltip = (
            <div className="p2" style={{width: 250}}>
                <div className="mb2">
                    {segment.description}
                </div>
                <FieldSet legend="Definition" border="border-light">
                    <div className="TooltipFilterList">
                        <FilterList
                            filters={Query.getFilters(segment.definition)}
                            tableMetadata={tableMetadata}
                            maxDisplayValues={Infinity}
                        />
                    </div>
                </FieldSet>
            </div>
        );

        return (
            <div className="p1">
                <Tooltip tooltipElement={tooltip}>
                    <span className="QuestionTooltipTarget" />
                </Tooltip>
            </div>
        );
    }

    renderSectionIcon(section, sectionIndex) {
        if (sectionIndex > 0) {
            return <Icon name="connections" width={18} height={18} />
        }
    }

    render() {
        return (
            <AccordianList
                className={this.props.className}
                sections={this.state.sections}
                itemIsSelected={this.itemIsSelected.bind(this)}
                renderItem={this.renderItem.bind(this)}
                renderSectionIcon={this.renderSectionIcon.bind(this)}
            />
        )
    }
}
