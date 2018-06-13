/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import MainPane from "./MainPane.jsx";
import TablePane from "./TablePane.jsx";
import FieldPane from "./FieldPane.jsx";
import SegmentPane from "./SegmentPane.jsx";
import MetricPane from "./MetricPane.jsx";
import Icon from "metabase/components/Icon.jsx";

import _ from "underscore";

export default class DataReference extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      stack: [],
      tables: {},
      fields: {},
    };

    _.bindAll(this, "back", "close", "show");
  }

  static propTypes = {
    query: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    runQuestionQuery: PropTypes.func.isRequired,
    setDatasetQuery: PropTypes.func.isRequired,
    setDatabaseFn: PropTypes.func.isRequired,
    setSourceTableFn: PropTypes.func.isRequired,
    setDisplayFn: PropTypes.func.isRequired,
  };

  close() {
    this.props.onClose();
  }

  back() {
    this.setState({
      stack: this.state.stack.slice(0, -1),
    });
  }

  show(type, item) {
    this.setState({
      stack: this.state.stack.concat({ type, item }),
    });
  }

  render() {
    let content;
    if (this.state.stack.length === 0) {
      content = <MainPane {...this.props} show={this.show} />;
    } else {
      let page = this.state.stack[this.state.stack.length - 1];
      if (page.type === "table") {
        content = (
          <TablePane {...this.props} show={this.show} table={page.item} />
        );
      } else if (page.type === "field") {
        content = (
          <FieldPane {...this.props} show={this.show} field={page.item} />
        );
      } else if (page.type === "segment") {
        content = (
          <SegmentPane {...this.props} show={this.show} segment={page.item} />
        );
      } else if (page.type === "metric") {
        content = (
          <MetricPane {...this.props} show={this.show} metric={page.item} />
        );
      }
    }

    let backButton;
    if (this.state.stack.length > 0) {
      backButton = (
        <a
          className="flex align-center mb2 text-default text-brand-hover no-decoration"
          onClick={this.back}
        >
          <Icon name="chevronleft" size={18} />
          <span className="text-uppercase">{t`Back`}</span>
        </a>
      );
    }

    let closeButton = (
      <a
        className="flex-align-right text-default text-brand-hover no-decoration"
        onClick={this.close}
      >
        <Icon name="close" size={18} />
      </a>
    );

    return (
      <div className="DataReference-container p3 full-height scroll-y">
        <div className="DataReference-header flex mb1">
          {backButton}
          {closeButton}
        </div>
        <div className="DataReference-content">{content}</div>
      </div>
    );
  }
}
