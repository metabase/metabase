import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import ColumnItem from "./ColumnItem.jsx";

export default class ColumnsList extends Component {
  static propTypes = {
    tableMetadata: PropTypes.object,
    idfields: PropTypes.array,
    updateField: PropTypes.func.isRequired,
  };

  render() {
    let { tableMetadata } = this.props;
    return (
      <div id="ColumnsList" className="my3">
        <h2 className="px1 text-orange">{t`Columns`}</h2>
        <div className="text-uppercase text-medium py1">
          <div
            style={{ minWidth: 420 }}
            className="float-left px1"
          >{t`Column`}</div>
          <div className="flex clearfix">
            <div className="flex-half px1">{t`Visibility`}</div>
            <div className="flex-half px1">{t`Type`}</div>
          </div>
        </div>
        <ol className="border-top border-bottom">
          {tableMetadata.fields.map(field => (
            <ColumnItem
              key={field.id}
              field={field}
              idfields={this.props.idfields}
              updateField={this.props.updateField}
            />
          ))}
        </ol>
      </div>
    );
  }
}
