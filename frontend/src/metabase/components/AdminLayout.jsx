import React, { Component } from "react";

import AdminHeader from "./AdminHeader.jsx";

export default class AdminLayout extends Component {
  setSaving = () => {
    this.refs.header.refs.status.setSaving();
  };
  setSaved = () => {
    this.refs.header.refs.status.setSaved();
  };
  setSaveError = error => {
    this.refs.header.refs.status.setSaveError(error);
  };

  render() {
    const { title, sidebar, children } = this.props;
    return (
      <div className="MetadataEditor full-height flex flex-column flex-full p4">
        <AdminHeader ref="header" title={title} />
        <div className="MetadataEditor-main flex flex-row flex-full mt2">
          {sidebar}
          <div className="px2 full">{children}</div>
        </div>
      </div>
    );
  }
}
