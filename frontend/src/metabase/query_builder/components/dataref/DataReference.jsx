/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import MainPane from "./MainPane";
import DatabasePane from "./DatabasePane";
import TablePane from "./TablePane";
import FieldPane from "./FieldPane";
import SegmentPane from "./SegmentPane";
import MetricPane from "./MetricPane";

import SidebarContent from "metabase/query_builder/components/SidebarContent";

const PANES = {
  database: DatabasePane,
  table: TablePane,
  field: FieldPane,
  segment: SegmentPane,
  metric: MetricPane,
};

export default class DataReference extends Component {
  constructor(props, context) {
    super(props, context);

    const { query } = props;

    const stack = [];
    const database = query && query.database();
    if (database) {
      stack.push({ type: "database", item: database });
    }
    const table = query && query.table();
    if (table) {
      stack.push({ type: "table", item: table });
    }

    this.state = {
      stack: stack,
      tables: {},
      fields: {},
    };
  }

  static propTypes = {
    query: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    runQuestionQuery: PropTypes.func.isRequired,
    setDatasetQuery: PropTypes.func.isRequired,
  };

  close = () => {
    this.props.onClose();
  };

  back = () => {
    this.setState({
      stack: this.state.stack.slice(0, -1),
    });
  };

  show = (type, item) => {
    this.setState({
      stack: this.state.stack.concat({ type, item }),
    });
  };

  render() {
    const { stack } = this.state;

    let title = null;
    let content = null;
    if (stack.length === 0) {
      title = t`Data Reference`;
      content = <MainPane {...this.props} show={this.show} />;
    } else {
      const page = stack[stack.length - 1];
      const Pane = PANES[page.type];
      content = Pane && (
        <Pane
          {...this.props}
          {...{ [page.type]: page.item }}
          show={this.show}
        />
      );
    }

    return (
      <SidebarContent
        title={title}
        onBack={stack.length > 0 ? this.back : null}
        onClose={this.close}
      >
        <div className="px4">{content}</div>
      </SidebarContent>
    );
  }
}
