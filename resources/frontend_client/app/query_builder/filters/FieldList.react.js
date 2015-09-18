"use strict";

import React, { Component, PropTypes } from "react";
import _ from "underscore";
import cx from "classnames";
import { getUmbrellaType } from 'metabase/lib/field_type';

import Icon from "metabase/components/Icon.react";

export default class FieldList extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    renderTypeIcon(field) {
        const width = 18;
        const height = 18;
        const type = getUmbrellaType(field);

        let name;

        switch(type) {
            case '':
            case 'time':
                name = 'calendar';
                break;
            case 'location':
                name = 'location';
                break;
            case 'string':
                name = 'string';
                break;
            case 'number':
                name = 'int';
                break;
            default:
                name = 'chevronup';
        }

        return <Icon name={name} width={width} height={height} />
    }

    render() {
        let { tableName, fieldOptions } = this.props;

        let mainSection = {
            name: tableName,
            fields: fieldOptions.fields.map(field => ({
                types: { base_type: field.base_type, special_type: field.special_type },
                name: field.display_name,
                value: field.id
            }))
        };

        let fkSections = fieldOptions.fks.map(fk => ({
            name: fk.field.target.table.display_name,
            fields: fk.fields.map(field => ({
                types: { base_type: field.base_type, special_type: field.special_type },
                name: field.display_name,
                value: ["fk->", fk.field.id, field.id]
            }))
        }));
        let sections = [mainSection].concat(fkSections);

        return (
            <div style={{width: '300px'}}>
                {sections.map(section =>
                    <section>
                      <div className="flex align-center p2 border-bottom">
                          <h3>{section.name}</h3>
                          <span className="flex-align-right">
                              <Icon name="chevrondown" width={12} height={12} />
                          </span>
                      </div>

                      <ul className="border-bottom">
                        {section.fields.map(field => {
                            return (
                                <li>
                                    <a className={cx('FieldList-item', 'flex align-center px2 py1 cursor-pointer', { 'FieldList-item--selected': _.isEqual(this.props.field, field.value) })}
                                       onClick={this.props.setField.bind(null, field.value)}>
                                        { this.renderTypeIcon(field.types) }
                                        <h4 className="ml1">{field.name}</h4>
                                    </a>
                                </li>
                            )
                        })}
                      </ul>
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
    setField: PropTypes.func.isRequired
};
