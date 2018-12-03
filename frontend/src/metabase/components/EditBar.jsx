import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

class EditBar extends Component {
  static propTypes = {
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    buttons: PropTypes.oneOfType([PropTypes.element, PropTypes.array])
      .isRequired,
    admin: PropTypes.bool,
  };

  static defaultProps = {
    admin: false,
  };

  render() {
    const { admin, buttons, subtitle, title } = this.props;
    return (
      <div
        className={cx("EditHeader wrapper py1 flex align-center", {
          "EditHeader--admin": admin,
        })}
        ref="editHeader"
      >
        <span className="EditHeader-title">{title}</span>
        {subtitle && (
          <span className="EditHeader-subtitle mx1">{subtitle}</span>
        )}
        <span className="flex-align-right flex">{buttons}</span>
      </div>
    );
  }
}

export default EditBar;
