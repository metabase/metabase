import { isEmail } from "metabase/lib/email";

import type { AvatarProps } from "./UserAvatar.styled";
import { Avatar as StyledAvatar } from "./UserAvatar.styled";

interface UserAvatarProps extends AvatarProps {
  user: User;
}

interface GroupProps {
  user: Group;
}

interface User {
  first_name: string | null;
  last_name: string | null;
  common_name: string;
  email?: string;
}

interface Group {
  first_name: string;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function UserAvatar({
  user,
  ...props
}: UserAvatarProps | GroupProps) {
  return <StyledAvatar {...props}>{userInitials(user) || "?"}</StyledAvatar>;
}

export function Avatar({ children, ...props }: { children: string }) {
  return <StyledAvatar {...props}>{initial(children) ?? "?"}</StyledAvatar>;
}

function initial(name?: string | null) {
  return name ? name.charAt(0).toUpperCase() : "";
}

function userInitials(user: User | Group) {
  if (user) {
    return nameInitials(user) || emailInitials(user as User);
  }

  return null;
}

function nameInitials(user: User | Group) {
  if ("common_name" in user) {
    return initial(user.first_name) + initial(user.last_name);
  }

  // render group
  return initial(user.first_name);
}

function emailInitials(user: User) {
  const email = [user.email, user.common_name].find(maybeEmail =>
    isEmail(maybeEmail),
  );
  if (email) {
    const emailUsername = email.split("@")[0];
    return emailUsername.slice(0, 2).toUpperCase();
  }

  return null;
}
