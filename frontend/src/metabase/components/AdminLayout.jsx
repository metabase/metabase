/* eslint-disable react/prop-types */
import React, { Component } from "react";

import AdminHeader from "./AdminHeader";

export default class AdminLayout extends Component {
  render() {
    const { title, sidebar, children, saveStatusRef } = this.props;
    return (
      <div className="MetadataEditor full-height flex flex-column flex-full p4">
        <AdminHeader saveStatusRef={saveStatusRef} title={title} />
        <div className="MetadataEditor-main flex flex-row flex-full mt2">
          {sidebar}
          <div className="px2 full">{children}</div>
        </div>
      </div>
    );
  }
}
