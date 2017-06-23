import React, { Component } from "react";
import PropTypes from "prop-types";

import AccordianList from "metabase/components/AccordianList.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import TimeGroupingPopover from "./TimeGroupingPopover.jsx";
import QueryDefinitionTooltip from "./QueryDefinitionTooltip.jsx";

import { isDate, getIconForField } from 'metabase/lib/schema_metadata';
import { parseFieldBucketing, parseFieldTargetId } from "metabase/lib/query_time";
import { stripId, singularize } from "metabase/lib/formatting";
import Query from "metabase/lib/query";

import _ from "underscore";


export default class FieldList extends Component {
    constructor(props, context) {
        super(props, context);

        _.bindAll(this, "onChange", "itemIsSelected", "renderItemExtra", "renderItemIcon", "renderSectionIcon", "getItemClasses");
    }

    static propTypes = {
        field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
        fieldOptions: PropTypes.object.isRequired,
        customFieldOptions: PropTypes.object,
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
        let { tableMetadata, field, fieldOptions, customFieldOptions, segmentOptions } = newProps;
        let tableName = tableMetadata.display_name;

        let specialOptions = [];
        if (segmentOptions) {
            specialOptions = segmentOptions.map(segment => ({
                name: segment.name,
                value: ["SEGMENT", segment.id],
                segment: segment
            }));
        }

        if (customFieldOptions) {
            specialOptions = specialOptions.concat(Object.keys(customFieldOptions).map(name => ({
                name: name,
                value: ["expression", name],
                customField: customFieldOptions[name]
            })));
        }

        let mainSection = {
            name: singularize(tableName),
            items: specialOptions.concat(fieldOptions.fields.map(field => ({
                name: Query.getFieldPathName(field.id, tableMetadata),
                value: typeof field.id === "number" ? ["field-id", field.id] : field.id,
                field: field
            })))
        };

        let fkSections = fieldOptions.fks.map(fk => ({
            name: stripId(fk.field.display_name),
            items: fk.fields.map(field => {
                const value = ["fk->", fk.field.id, field.id];
                const target = Query.getFieldTarget(value, tableMetadata);
                return {
                    name: Query.getFieldPathName(target.field.id, target.table),
                    value: value,
                    field: field
                };
            })
        }));

        let sections = []
        if (mainSection.items.length > 0) {
            sections.push(mainSection);
        }
        sections.push(...fkSections);

        let fieldTarget = parseFieldTargetId(field);

        this.setState({ sections, fieldTarget });
    }

    itemIsSelected(item) {
        let { fieldTarget } = this.state;
        if (typeof fieldTarget === "number") {
            fieldTarget = ["field-id", fieldTarget];
        }
        return _.isEqual(fieldTarget, item.value);
    }

    renderItemExtra(item) {
        let { field, enableTimeGrouping } = this.props;

        return (
            <div className="Field-extra flex align-center">
                { item.segment &&
                    this.renderSegmentTooltip(item.segment)
                }
                { item.customField &&
                    <span className="h5 text-grey-2 px1">Custom</span>
                }
                { item.field && enableTimeGrouping && isDate(item.field) &&
                    <PopoverWithTrigger
                        id="TimeGroupingPopover"
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
                            field={field || ["datetime-field", item.value, "as", null]}
                            onFieldChange={this.props.onFieldChange}
                            groupingOptions={item.field.grouping_options}
                        />
                    </PopoverWithTrigger>
                }
            </div>
        );
    }

    renderItemIcon(item) {
        let name;
        if (item.segment) {
            name = "staroutline";
        } else if (item.field) {
            name = getIconForField(item.field);
        } else if (item.customField) {
            // TODO: need to make this better
            name = 'int';
        }
        return <Icon name={name || 'unknown'} size={18} />;
    }

    renderTimeGroupingTrigger(field) {
        return (
            <div className="FieldList-grouping-trigger flex align-center p1 cursor-pointer">
                <h4 className="mr1">by {parseFieldBucketing(field, "day").split("-").join(" ")}</h4>
                <Icon name="chevronright" size={16} />
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
            return "List-item--segment";
        } else {
            return null;
        }
    }

    renderSectionIcon(section, sectionIndex) {
        if (sectionIndex > 0) {
            return <Icon name="connections" size={18} />
        } else {
            return <Icon name="table2" size={18} />;
        }
    }

    onChange(item) {
        if (item.segment) {
            this.props.onFilterChange(item.value);
        } else if (this.itemIsSelected(item)) {
            // ensure if we select the same item we don't reset datetime-field's unit
            this.props.onFieldChange(this.props.field);
        }  else if (this.props.enableTimeGrouping && isDate(item.field)) {
            this.props.onFieldChange(["datetime-field", item.value, "as", "day"]);
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
                alwaysExpanded={this.props.alwaysExpanded}
            />
        )
    }
}
