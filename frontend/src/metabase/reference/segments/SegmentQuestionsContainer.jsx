/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import SegmentSidebar from "./SegmentSidebar.jsx";
import SidebarLayout from "metabase/components/SidebarLayout.jsx";
import SegmentQuestions from "metabase/reference/segments/SegmentQuestions.jsx";

import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";

import {
  getUser,
  getSegment,
  getSegmentId,
  getDatabaseId,
  getIsEditing,
} from "../selectors";

import Questions from "metabase/entities/questions";

const mapStateToProps = (state, props) => ({
  user: getUser(state, props),
  segment: getSegment(state, props),
  segmentId: getSegmentId(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state, props),
});

const mapDispatchToProps = {
  fetchQuestions: Questions.actions.fetchList,
  ...metadataActions,
  ...actions,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class SegmentQuestionsContainer extends Component {
  static propTypes = {
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    databaseId: PropTypes.number.isRequired,
    user: PropTypes.object.isRequired,
    segment: PropTypes.object.isRequired,
    segmentId: PropTypes.number.isRequired,
    isEditing: PropTypes.bool,
  };

  async fetchContainerData() {
    await actions.wrappedFetchSegmentQuestions(
      this.props,
      this.props.segmentId,
    );
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
    const { user, segment, isEditing } = this.props;

    return (
      <SidebarLayout
        className="flex-full relative"
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<SegmentSidebar segment={segment} user={user} />}
      >
        <SegmentQuestions {...this.props} />
      </SidebarLayout>
    );
  }
}
