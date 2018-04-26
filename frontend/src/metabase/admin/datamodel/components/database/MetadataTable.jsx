import React, { Component } from "react";
import PropTypes from "prop-types";

import MetricsList from "./MetricsList.jsx";
import ColumnsList from "./ColumnsList.jsx";
import SegmentsList from "./SegmentsList.jsx";
import { t } from "c-3po";
import Input from "metabase/components/Input.jsx";
import ProgressBar from "metabase/components/ProgressBar.jsx";

import _ from "underscore";
import cx from "classnames";

export default class MetadataTable extends Component {
  constructor(props, context) {
    super(props, context);
    this.onDescriptionChange = this.onDescriptionChange.bind(this);
    this.onNameChange = this.onNameChange.bind(this);
    this.updateProperty = this.updateProperty.bind(this);
  }

  static propTypes = {
    tableMetadata: PropTypes.object,
    idfields: PropTypes.array.isRequired,
    updateTable: PropTypes.func.isRequired,
    updateField: PropTypes.func.isRequired,
  };

  isHidden() {
    return !!this.props.tableMetadata.visibility_type;
  }

  updateProperty(name, value) {
    this.props.tableMetadata[name] = value;
    this.setState({ saving: true });
    this.props.updateTable(this.props.tableMetadata);
  }

  onNameChange(event) {
    if (!_.isEmpty(event.target.value)) {
      this.updateProperty("display_name", event.target.value);
    } else {
      // if the user set this to empty then simply reset it because that's not allowed!
      event.target.value = this.props.tableMetadata.display_name;
    }
  }

  onDescriptionChange(event) {
    this.updateProperty("description", event.target.value);
  }

  renderVisibilityType(text, type, any) {
    let classes = cx(
      "mx1",
      "text-bold",
      "text-brand-hover",
      "cursor-pointer",
      "text-default",
      {
        "text-brand":
          this.props.tableMetadata.visibility_type === type ||
          (any && this.props.tableMetadata.visibility_type),
      },
    );
    return (
      <span
        className={classes}
        onClick={this.updateProperty.bind(null, "visibility_type", type)}
      >
        {text}
      </span>
    );
  }

  renderVisibilityWidget() {
    let subTypes;
    if (this.props.tableMetadata.visibility_type) {
      subTypes = (
        <span id="VisibilitySubTypes" className="border-left mx2">
          <span className="mx2 text-uppercase text-grey-3">{t`Why Hide?`}</span>
          {this.renderVisibilityType(t`Technical Data`, "technical")}
          {this.renderVisibilityType(t`Irrelevant/Cruft`, "cruft")}
        </span>
      );
    }
    return (
      <span id="VisibilityTypes">
        {this.renderVisibilityType(t`Queryable`, null)}
        {this.renderVisibilityType(t`Hidden`, "hidden", true)}
        {subTypes}
      </span>
    );
  }

  render() {
    const { tableMetadata } = this.props;
    if (!tableMetadata) {
      return false;
    }

    return (
      <div className="MetadataTable px3 flex-full">
        <div className="MetadataTable-title flex flex-column bordered rounded">
          <Input
            className="AdminInput TableEditor-table-name text-bold border-bottom rounded-top"
            type="text"
            value={tableMetadata.display_name || ""}
            onBlurChange={this.onNameChange}
          />
          <Input
            className="AdminInput TableEditor-table-description rounded-bottom"
            type="text"
            value={tableMetadata.description || ""}
            onBlurChange={this.onDescriptionChange}
            placeholder={t`No table description yet`}
          />
        </div>
        <div className="MetadataTable-header flex align-center py2 text-grey-3">
          <span className="mx1 text-uppercase">{t`Visibility`}</span>
          {this.renderVisibilityWidget()}
          <span className="flex-align-right flex align-center">
            <span className="text-uppercase mr1">{t`Metadata Strength`}</span>
            <ProgressBar percentage={tableMetadata.metadataStrength} />
          </span>
        </div>
        <div className={"mt2 " + (this.isHidden() ? "disabled" : "")}>
          <SegmentsList
            tableMetadata={tableMetadata}
            onRetire={this.props.onRetireSegment}
          />
          <MetricsList
            tableMetadata={tableMetadata}
            onRetire={this.props.onRetireMetric}
          />
          <ColumnsList
            tableMetadata={tableMetadata}
            idfields={this.props.idfields}
            updateField={this.props.updateField}
          />
        </div>
      </div>
    );
  }
}
