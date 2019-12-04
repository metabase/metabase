/* @flow */

import styled from "styled-components";
import { Flex } from "grid-styled";
import { height } from "styled-system";

import { color } from "metabase/lib/colors";

const Avatar = styled(Flex).attrs({
  align: "center",
  justifyContent: "center",
  height: ({ size }) => size,
  width: ({ size }) => size,
  fontSize: ({ size }) => size * 0.75,
})`
  ${height};
  border-radius: 999px;
  font-weight: 900;
  line-height: 1;
`;

Avatar.defaultProps = {
  bg: color("brand"),
  color: "white",
  size: ["3em"],
};

function initial(name) {
  return typeof name === "string" ? name.charAt(0).toUpperCase() : "";
}

function userInitials(user) {
  return user ? initial(user.first_name) + initial(user.last_name) : null;
}

const UserAvatar = styled(Avatar).attrs({
  children: ({ user }) => userInitials(user) || "?",
})``;

export default UserAvatar;
