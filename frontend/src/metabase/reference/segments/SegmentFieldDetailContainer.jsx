/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";

import SidebarLayout from "metabase/components/SidebarLayout";
import CS from "metabase/css/core/index.css";
import * as metadataActions from "metabase/redux/metadata";
import * as actions from "metabase/reference/reference";
import SegmentFieldDetail from "metabase/reference/segments/SegmentFieldDetail";

import {
  getSegment,
  getSegmentId,
  getField,
  getDatabaseId,
  getIsEditing,
} from "../selectors";

import SegmentFieldSidebar from "./SegmentFieldSidebar";

const mapStateToProps = (state, props) => ({
  segment: getSegment(state, props),
  segmentId: getSegmentId(state, props),
  field: getField(state, props),
  databaseId: getDatabaseId(state, props),
  isEditing: getIsEditing(state, props),
});

const mapDispatchToProps = {
  ...metadataActions,
  ...actions,
};

class SegmentFieldDetailContainer extends Component {
  static propTypes = {
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    databaseId: PropTypes.number.isRequired,
    segment: PropTypes.object.isRequired,
    segmentId: PropTypes.number.isRequired,
    field: PropTypes.object.isRequired,
    isEditing: PropTypes.bool,
  };

  async fetchContainerData() {
    await actions.wrappedFetchSegmentFields(this.props, this.props.segmentId);
  }

  UNSAFE_componentWillMount() {
    this.fetchContainerData();
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    if (this.props.location.pathname === newProps.location.pathname) {
      return;
    }

    actions.clearState(newProps);
  }

  render() {
    const { segment, field, isEditing } = this.props;

    return (
      <SidebarLayout
        className={cx(CS.flexFull, CS.relative)}
        style={isEditing ? { paddingTop: "43px" } : {}}
        sidebar={<SegmentFieldSidebar segment={segment} field={field} />}
      >
        <SegmentFieldDetail {...this.props} />
      </SidebarLayout>
    );
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentFieldDetailContainer);
