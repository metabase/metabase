import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { Flex } from "rebass"

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
      <Flex
        align='center'
        py={1}
        px={4}
        className={cx("EditHeader", {
          "EditHeader--admin": admin,
        })}
        ref="editHeader"
      >
        <span className="EditHeader-title">{title}</span>
        {subtitle && (
          <span className="EditHeader-subtitle mx1">{subtitle}</span>
        )}
        <span className="flex-align-right flex">{buttons}</span>
      </Flex>
    );
  }
}

export default EditBar;
