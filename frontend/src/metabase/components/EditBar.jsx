import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

class EditBar extends Component {
  static propTypes = {
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    center: PropTypes.node,
    buttons: PropTypes.oneOfType([PropTypes.element, PropTypes.array])
      .isRequired,
    admin: PropTypes.bool,
    className: PropTypes.string,
  };

  static defaultProps = {
    admin: false,
  };

  render() {
    const { admin, buttons, subtitle, title, center, className } = this.props;
    return (
      <div
        className={cx(
          "EditHeader wrapper py1 flex align-center justify-between",
          {
            "EditHeader--admin": admin,
          },
          className,
        )}
      >
        <div>
          <span className="EditHeader-title">{title}</span>
          {subtitle && (
            <span className="EditHeader-subtitle mx1">{subtitle}</span>
          )}
        </div>
        {center && <div>{center}</div>}
        <div>
          <span className="flex">{buttons}</span>
        </div>
      </div>
    );
  }
}

export default EditBar;
