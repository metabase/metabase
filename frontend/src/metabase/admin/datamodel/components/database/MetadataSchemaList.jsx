import React, { Component } from "react";

import Icon from "metabase/components/Icon.jsx";
import { t } from "c-3po";
import { inflect } from "metabase/lib/formatting";

import _ from "underscore";
import cx from "classnames";

export default class MetadataSchemaList extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      searchText: "",
      searchRegex: null,
    };

    _.bindAll(this, "updateSearchText");
  }

  updateSearchText(event) {
    this.setState({
      searchText: event.target.value,
      searchRegex: event.target.value
        ? new RegExp(RegExp.escape(event.target.value), "i")
        : null,
    });
  }

  render() {
    const { schemas, selectedSchema } = this.props;
    const { searchRegex } = this.state;

    let filteredSchemas = searchRegex
      ? schemas.filter(s => searchRegex.test(s.name))
      : schemas;
    return (
      <div className="MetadataEditor-table-list AdminList flex-no-shrink">
        <div className="AdminList-search">
          <Icon name="search" size={16} />
          <input
            className="AdminInput pl4 border-bottom"
            type="text"
            placeholder={t`Find a schema`}
            value={this.state.searchText}
            onChange={this.updateSearchText}
          />
        </div>
        <ul className="AdminList-items">
          <li className="AdminList-section">
            {filteredSchemas.length} {inflect("schema", filteredSchemas.length)}
          </li>
          {filteredSchemas.map(schema => (
            <li key={schema.name}>
              <a
                className={cx(
                  "AdminList-item flex align-center no-decoration",
                  {
                    selected:
                      selectedSchema && selectedSchema.name === schema.name,
                  },
                )}
                onClick={() => this.props.onChangeSchema(schema)}
              >
                {schema.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}
