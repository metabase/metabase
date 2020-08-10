/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import SidebarLayout from "metabase/components/SidebarLayout";
import MetricList from "metabase/reference/metrics/MetricList";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";

import { getDatabaseId, getIsEditing } from "../selectors";

const mapStateToProps = (state, props) => ({
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class MetricListContainer extends Component {
  static propTypes = {
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    databaseId: PropTypes.number.isRequired,
    isEditing: PropTypes.bool,
  };

  async fetchContainerData() {
    await actions.wrappedFetchMetrics(this.props);
  }

  componentWillMount() {
    this.fetchContainerData();
  }

  componentWillReceiveProps(newProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps);
  }

  render() {
    const { isEditing } = this.props;

    return (
      <SidebarLayout
        className="flex-full relative"
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<BaseSidebar />}
      >
        <MetricList {...this.props} />
      </SidebarLayout>
    );
  }
}
