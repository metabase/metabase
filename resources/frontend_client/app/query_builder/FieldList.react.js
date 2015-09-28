"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";
import TimeGroupingPopover from "./TimeGroupingPopover.react";

import { isDate, getUmbrellaType, TIME, NUMBER, STRING, LOCATION } from 'metabase/lib/schema_metadata';
import { parseFieldBucketing, parseFieldTarget } from "metabase/lib/query_time";

import _ from "underscore";
import cx from "classnames";

const ICON_MAPPING = {
    [TIME]:  'calendar',
    [LOCATION]: 'location',
    [STRING]: 'string',
    [NUMBER]: 'int'
};

export default class FieldList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            openSection: 0
        };
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        let { tableName, field, fieldOptions } = newProps;

        let mainSection = {
            name: tableName,
            fields: fieldOptions.fields.map(field => ({
                field: field,
                value: field.id
            }))
        };

        let fkSections = fieldOptions.fks.map(fk => ({
            name: fk.field.target.table.display_name,
            fields: fk.fields.map(field => ({
                field: field,
                value: ["fk->", fk.field.id, field.id]
            }))
        }));

        let sections = [mainSection].concat(fkSections);
        let fieldTarget = parseFieldTarget(field);

        let openSection = 0;
        for (let i = 0; i < sections.length; i++) {
            if (_.some(sections[i].fields, (item) => _.isEqual(fieldTarget, item.value))) {
                openSection = i;
                break;
            }
        }

        this.setState({ sections, fieldTarget, openSection });
    }

    toggleSection(sectionIndex) {
        if (this.state.openSection === sectionIndex) {
            this.setState({ openSection: null });
        } else {
            this.setState({ openSection: sectionIndex });
        }
    }

    renderTypeIcon(field) {
        let type = getUmbrellaType(field);
        let name = ICON_MAPPING[type] || 'close';
        return <Icon name={name} width={18} height={18} />
    }

    renderTimeGroupingTrigger(field) {
        return (
            <div className="FieldList-grouping-trigger flex align-center p1 cursor-pointer">
                <h4 className="mr1">by {parseFieldBucketing(field).split("-").join(" ")}</h4>
                <Icon name="chevronright" width={16} height={16} />
            </div>
        )
    }

    render() {
        let { field } = this.props;
        let { sections, fieldTarget, openSection } = this.state;

        return (
            <div className={this.props.className} style={{width: '300px'}}>
                {sections.map((section, sectionIndex) =>
                    <section key={sectionIndex}>
                        <div className="p2 border-bottom">
                            { sections.length > 1 ?
                                <div className="List-section-header cursor-pointer full flex align-center" onClick={() => this.toggleSection(sectionIndex)}>
                                    <h4>{section.name}</h4>
                                    <span className="flex-align-right">
                                        <Icon name={openSection === sectionIndex ? "chevronup" : "chevrondown"} width={12} height={12} />
                                    </span>
                                </div>
                            :
                                <h4 className="text-default">{section.name}</h4>
                            }
                        </div>
                        { openSection === sectionIndex ?
                            <ul className="border-bottom p1">
                              {section.fields.map((item, itemIndex) => {
                                  return (
                                      <li key={itemIndex} className={cx("List-item flex", { 'List-item--selected': _.isEqual(fieldTarget, item.value) })}>
                                            <a className="flex-full flex align-center px2 py1 cursor-pointer"
                                                 onClick={this.props.onFieldChange.bind(null, item.value)}
                                            >
                                                { this.renderTypeIcon(item.field) }
                                                <h4 className="List-item-title ml1">{item.field.display_name}</h4>
                                            </a>
                                            { this.props.enableTimeGrouping && isDate(item.field) ?
                                                <PopoverWithTrigger
                                                    className={"PopoverBody " + this.props.className}
                                                    triggerElement={this.renderTimeGroupingTrigger(field)}
                                                    tetherOptions={{
                                                        attachment: 'top left',
                                                        targetAttachment: 'top right',
                                                        targetOffset: '0 0'
                                                        // constraints: [{ to: 'window', attachment: 'together', pin: ['top', 'bottom']}]
                                                    }}
                                                >
                                                    <TimeGroupingPopover
                                                        field={field}
                                                        value={item.value}
                                                        onFieldChange={this.props.onFieldChange}
                                                    />
                                                </PopoverWithTrigger>
                                            : null }
                                      </li>
                                  )
                              })}
                            </ul>
                        : null }
                    </section>
                )}
            </div>
        );
    }
}

FieldList.propTypes = {
    field: PropTypes.oneOfType([React.PropTypes.number, React.PropTypes.array]),
    fieldOptions: PropTypes.object.isRequired,
    tableName: PropTypes.string,
    onFieldChange: PropTypes.func.isRequired,
    enableTimeGrouping: PropTypes.bool
};
