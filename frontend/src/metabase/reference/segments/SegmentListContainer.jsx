/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import BaseSidebar from "metabase/reference/guide/BaseSidebar.jsx";
import SidebarLayout from "metabase/components/SidebarLayout.jsx";
import SegmentList from "metabase/reference/segments/SegmentList.jsx";

export default class SegmentListContainer extends Component {
  static propTypes = {
    params: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
  };

  render() {
    return (
      <SidebarLayout className="flex-full relative" sidebar={<BaseSidebar />}>
        <SegmentList {...this.props} />
      </SidebarLayout>
    );
  }
}
