import React, { Component, PropTypes } from "react";

import AccordianList from "./AccordianList.jsx";
import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import TimeGroupingPopover from "./TimeGroupingPopover.jsx";

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
    }

    static propTypes = {
        field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
        fieldOptions: PropTypes.object.isRequired,
        tableName: PropTypes.string,
        onFieldChange: PropTypes.func.isRequired,
        enableTimeGrouping: PropTypes.bool,
        tableMetadata: PropTypes.object.isRequired
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        let { tableMetadata, field, fieldOptions } = newProps;
        let tableName = tableMetadata.display_name;

        let mainSection = {
            name: singularize(tableName),
            items: fieldOptions.fields.map(field => ({
                field: field,
                value: field.id
            }))
        };

        let fkSections = fieldOptions.fks.map(fk => ({
            name: stripId(fk.field.display_name),
            items: fk.fields.map(field => ({
                field: field,
                value: ["fk->", fk.field.id, field.id]
            }))
        }));

        let sections = [mainSection].concat(fkSections);
        let fieldTarget = parseFieldTarget(field);

        this.setState({ sections, fieldTarget });
    }

    sectionIsSelected(section, sectionIndex) {
        let { sections, fieldTarget } = this.state;
        let selectedSection = 0;
        for (let i = 0; i < sections.length; i++) {
            if (_.some(sections[i].items, (item) => _.isEqual(fieldTarget, item.value))) {
                selectedSection = i;
                break;
            }
        }
        return selectedSection === sectionIndex;
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
            <div className="flex-full flex">
                <a className="flex-full flex align-center px1 py1 cursor-pointer"
                     onClick={this.props.onFieldChange.bind(null, item.value)}
                >
                    { this.renderTypeIcon(item.field) }
                    <h4 className="List-item-title ml2">{item.field.display_name}</h4>
                </a>
                { enableTimeGrouping && isDate(item.field) ?
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
                : null }
            </div>
        );
    }

    renderTypeIcon(field) {
        let type = getFieldType(field);
        let name = ICON_MAPPING[type] || 'unknown';
        return <Icon name={name} width={18} height={18} />;
    }

    renderTimeGroupingTrigger(field) {
        return (
            <div className="FieldList-grouping-trigger flex align-center p1 cursor-pointer">
                <h4 className="mr1">by {parseFieldBucketing(field).split("-").join(" ")}</h4>
                <Icon name="chevronright" width={16} height={16} />
            </div>
        )
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
                sectionIsSelected={this.sectionIsSelected.bind(this)}
                itemIsSelected={this.itemIsSelected.bind(this)}
                renderItem={this.renderItem.bind(this)}
                renderSectionIcon={this.renderSectionIcon.bind(this)}
            />
        )
    }
}
