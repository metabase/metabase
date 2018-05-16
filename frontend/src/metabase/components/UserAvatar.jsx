import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

export default class UserAvatar extends Component {
  constructor(props, context) {
    super(props, context);
    this.styles = {
      fontSize: "0.85rem",
      borderWidth: "1px",
      borderStyle: "solid",
      borderRadius: "99px",
      width: "2rem",
      height: "2rem",
      color: "white",
    };
  }

  static propTypes = {
    background: PropTypes.string,
    user: PropTypes.object.isRequired,
  };

  static defaultProps = {
    background: "bg-brand",
  };

  userInitials() {
    const { first_name, last_name } = this.props.user;

    function initial(name) {
      return typeof name !== "undefined" && name.length
        ? name.substring(0, 1).toUpperCase()
        : "";
    }

    const initials = initial(first_name) + initial(last_name);

    return initials.length ? initials : "?";
  }

  render() {
    const { background } = this.props;
    const classes = {
      flex: true,
      "align-center": true,
      "justify-center": true,
    };
    classes[background] = true;

    return (
      <div
        className={cx(classes)}
        style={{ ...this.styles, ...this.props.style }}
      >
        {this.userInitials()}
      </div>
    );
  }
}
