/* eslint-disable react/prop-types */
import { Component } from "react";

export default class AdminHeader extends Component {
  render() {
    return (
      <div className="MetadataEditor-header clearfix relative flex-no-shrink">
        <div className="MetadataEditor-headerSection float-left h2 text-medium">
          {this.props.title}
        </div>
      </div>
    );
  }
}
