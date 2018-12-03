import React, { Component } from "react";
import PropTypes from "prop-types";

export default class FormLabel extends Component {
  static propTypes = {
    title: PropTypes.string,
    description: PropTypes.string,
  };

  static defaultProps = {
    title: "",
    description: "",
  };

  render() {
    let { title, description, children } = this.props;
    return (
      <div className="mb3">
        <div style={{ maxWidth: "575px" }}>
          {title && (
            <label className="h5 text-bold text-uppercase">{title}</label>
          )}
          {description && <p className="mt1 mb2">{description}</p>}
        </div>
        {children}
      </div>
    );
  }
}
