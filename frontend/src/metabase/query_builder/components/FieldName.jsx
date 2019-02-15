import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import Clearable from "./Clearable.jsx";

import Query from "metabase/lib/query";

import Dimension from "metabase-lib/lib/Dimension";

import _ from "underscore";
import cx from "classnames";

export default class FieldName extends Component {
  static propTypes = {
    field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
    onClick: PropTypes.func,
    onRemove: PropTypes.func,
    tableMetadata: PropTypes.object.isRequired,
    query: PropTypes.object,
  };

  static defaultProps = {
    className: "",
  };

  displayNameForFieldLiteral(tableMetadata, fieldLiteral) {
    // see if we can find an entry in the table metadata that matches the field literal
    let matchingField = _.find(
      tableMetadata.fields,
      field =>
        Query.isFieldLiteral(field.id) && field.id[1] === fieldLiteral[1],
    ); // check whether names of field literals match

    return (matchingField && matchingField.display_name) || fieldLiteral[1];
  }

  render() {
    let { field, tableMetadata, query, className } = this.props;

    if (!tableMetadata && query) {
      tableMetadata = query.tableMetadata();
    }

    let parts = [];

    if (field) {
      const dimension = query
        ? query.parseFieldReference(field)
        : Dimension.parseMBQL(field, tableMetadata && tableMetadata.metadata);
      if (dimension) {
        parts = <span key="field">{dimension.render()}</span>;
      } else if (Query.isFieldLiteral(field)) {
        // TODO Atte Keinänen 6/23/17: Move nested queries logic to Dimension subclasses
        // if the Field in question is a field literal, e.g. ["field-literal", <name>, <type>] just use name as-is
        parts.push(
          <span key="field">
            {this.displayNameForFieldLiteral(tableMetadata, field)}
          </span>,
        );
      } else if (Query.isLocalField(field) && Query.isFieldLiteral(field[1])) {
        // otherwise if for some weird reason we wound up with a Field Literal inside a field ID,
        // e.g. ["field-id", ["field-literal", <name>, <type>], still just use the name as-is
        parts.push(
          <span key="field">
            {this.displayNameForFieldLiteral(tableMetadata, field[1])}
          </span>,
        );
      } else {
        parts.push(<span key="field">{t`Unknown Field`}</span>);
      }
    } else {
      parts.push(<span key="field" className={"text-light"}>{t`field`}</span>);
    }

    const content = (
      <span
        className={cx(className, {
          selected: Query.isValidField(field),
          "cursor-pointer": this.props.onClick,
        })}
        onClick={this.props.onClick}
      >
        {parts}
      </span>
    );

    return this.props.onRemove ? (
      <Clearable onClear={this.props.onRemove}>{content}</Clearable>
    ) : (
      content
    );
  }
}
