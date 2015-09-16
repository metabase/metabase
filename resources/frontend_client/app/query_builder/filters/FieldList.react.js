"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

import _ from "underscore";
import cx from "classnames";

export default class FieldList extends Component {
    constructor(props) {
        super(props);

        this.state = {};
    }

    render() {
        let { tableName, fieldOptions } = this.props;

        let mainSection = {
            name: tableName,
            fields: fieldOptions.fields.map(field => ({
                name: field.display_name,
                value: field.id
            }))
        };
        let fkSections = fieldOptions.fks.map(fk => ({
            name: fk.field.target.table.display_name,
            fields: fk.fields.map(field => ({
                name: field.display_name,
                value: ["fk->", fk.field.id, field.id]
            }))
        }));
        let sections = [mainSection].concat(fkSections);

        return (
            <div>
                {sections.map(section =>
                    <section>
                      <h3>{section.name}</h3>
                      <ul>
                        {section.fields.map(field =>
                            <li className={cx("FieldList-item", { "FieldList-item--selected": _.isEqual(this.props.field, field.value) })}>
                                <a className="cursor-pointer" onClick={this.props.setField.bind(null, field.value)}>
                                    <Icon name="" width="22px" height="22px"/>
                                    {field.name}
                                </a>
                            </li>
                        )}
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
