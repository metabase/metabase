import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import ColumnItem from "./ColumnItem";

export default class ColumnsList extends Component {
  static propTypes = {
    fields: PropTypes.array,
    idfields: PropTypes.array,
    updateField: PropTypes.func.isRequired,
  };

  render() {
    const { fields = [] } = this.props;
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
          {fields.map(field => (
            <ColumnItem
              key={field.id}
              field={field}
              updateField={this.props.updateField}
              idfields={this.props.idfields}
            />
          ))}
        </ol>
      </div>
    );
  }
}
