import React, { Component } from "react";
import PropTypes from "prop-types";

class EditWarning extends Component {
  static propTypes = {
    title: PropTypes.string.isRequired
  };

  render() {
    const { title } = this.props;
    return (
      <div
        className={"EditHeader wrapper py1 flex align-center"}
        ref="editWarning"
      >
        <span className="EditHeader-title">{title}</span>
      </div>
    );
  }
}

export default EditWarning;
