import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";

import { t, ngettext, msgid } from "ttag";

import _ from "underscore";
import cx from "classnames";

import { regexpEscape } from "metabase/lib/string";

export default class MetadataTableList extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      searchText: "",
      searchRegex: null,
    };

    _.bindAll(this, "updateSearchText");
  }

  static propTypes = {
    tableId: PropTypes.number,
    tables: PropTypes.array.isRequired,
    selectTable: PropTypes.func.isRequired,
  };

  updateSearchText(event) {
    this.setState({
      searchText: event.target.value,
      searchRegex: event.target.value
        ? new RegExp(regexpEscape(event.target.value), "i")
        : null,
    });
  }

  render() {
    let queryableTablesHeader, hiddenTablesHeader;
    const queryableTables = [];
    const hiddenTables = [];

    if (this.props.tables) {
      const tables = _.sortBy(this.props.tables, "display_name");
      _.each(tables, table => {
        const selected = this.props.tableId === table.id;
        const row = (
          <li key={table.id}>
            <a
              className={cx(
                "AdminList-item flex align-center no-decoration text-wrap",
                {
                  selected,
                },
              )}
              onClick={this.props.selectTable.bind(null, table)}
            >
              {table.display_name}
            </a>
          </li>
        );
        const regex = this.state.searchRegex;
        if (
          !regex ||
          regex.test(table.display_name) ||
          regex.test(table.name)
        ) {
          if (table.visibility_type) {
            hiddenTables.push(row);
          } else {
            queryableTables.push(row);
          }
        }
      });
    }

    if (queryableTables.length > 0) {
      queryableTablesHeader = (
        <li className="AdminList-section">
          {(n =>
            ngettext(msgid`${n} Queryable Table`, `${n} Queryable Tables`, n))(
            queryableTables.length,
          )}
        </li>
      );
    }
    if (hiddenTables.length > 0) {
      hiddenTablesHeader = (
        <li className="AdminList-section">
          {(n => ngettext(msgid`${n} Hidden Table`, `${n} Hidden Tables`, n))(
            hiddenTables.length,
          )}
        </li>
      );
    }
    if (queryableTables.length === 0 && hiddenTables.length === 0) {
      queryableTablesHeader = <li className="AdminList-section">0 Tables</li>;
    }

    return (
      <div className="MetadataEditor-table-list AdminList flex-no-shrink">
        <div className="AdminList-search">
          <Icon name="search" size={16} />
          <input
            className="AdminInput pl4 border-bottom"
            type="text"
            placeholder={t`Find a table`}
            value={this.state.searchText}
            onChange={this.updateSearchText}
          />
        </div>
        {(this.props.onBack || this.props.schema) && (
          <h4 className="p2 border-bottom">
            {this.props.onBack && (
              <span
                className="text-brand cursor-pointer"
                onClick={this.props.onBack}
              >
                <Icon name="chevronleft" size={10} />
                {t`Schemas`}
              </span>
            )}
            {this.props.onBack && this.props.schema && (
              <span className="mx1">-</span>
            )}
            {this.props.schema && <span> {this.props.schema.name}</span>}
          </h4>
        )}

        <ul className="AdminList-items">
          {queryableTablesHeader}
          {queryableTables}
          {hiddenTablesHeader}
          {hiddenTables}
        </ul>
      </div>
    );
  }
}
