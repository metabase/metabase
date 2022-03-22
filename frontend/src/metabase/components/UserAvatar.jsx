/* eslint-disable react/prop-types */
import React from "react";
import styled from "@emotion/styled";
import { color, height, width } from "styled-system";

import { color as brandColor } from "metabase/lib/colors";

const Avatar = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 999px;
  font-weight: 900;
  line-height: 1;
  ${height};
  ${width};
  ${color};
  background-color: ${({ bg = brandColor("brand") }) => bg};
`;

Avatar.defaultProps = {
  color: "white",
  height: ["3em"],
  width: ["3em"],
};

function initial(name) {
  return typeof name === "string" ? name.charAt(0).toUpperCase() : "";
}

function userInitials(user) {
  return user ? initial(user.first_name) + initial(user.last_name) : null;
}

const UserAvatar = ({ user, ...props }) => (
  <Avatar {...props}>{userInitials(user) || "?"}</Avatar>
);

UserAvatar.displayName = "UserAvatar";

export default UserAvatar;
