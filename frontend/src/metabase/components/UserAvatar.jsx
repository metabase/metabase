/* @flow */

import React, { Component } from "react";
import { Flex } from "grid-styled";
import styled from "styled-components";
import { height } from "styled-system";

import colors from "metabase/lib/colors";

const DEFAULT_AVATAR_SIZES = ["3em"];

const Avatar = styled(Flex)`
  ${height}
  border-radius: 999px;
  font-weight: 900;
  line-height: 1;
`;

export default class UserAvatar extends Component {
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
    return (
      <Avatar
        align="center"
        justifyContent="center"
        width={DEFAULT_AVATAR_SIZES}
        height={DEFAULT_AVATAR_SIZES}
        bg={colors["brand"]}
        color="white"
        {...this.props}
      >
        {this.userInitials()}
      </Avatar>
    );
  }
}
