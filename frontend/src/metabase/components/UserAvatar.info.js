import React from "react";
import UserAvatar from "metabase/components/UserAvatar";

export const component = UserAvatar;
export const category = "display";

export const examples = {
  // XXX: What should we display in an avatar when there's no name?
  "": <UserAvatar />,
};
