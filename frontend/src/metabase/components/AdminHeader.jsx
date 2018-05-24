import React, { Component } from "react";

import SaveStatus from "metabase/components/SaveStatus.jsx";

export default class AdminHeader extends Component {
  render() {
    return (
      <div className="MetadataEditor-header clearfix relative flex-no-shrink">
        <div className="MetadataEditor-headerSection float-left h2 text-grey-4">
          {this.props.title}
        </div>
        <div className="MetadataEditor-headerSection absolute right float-right top bottom flex layout-centered">
          <SaveStatus ref="status" />
        </div>
      </div>
    );
  }
}
