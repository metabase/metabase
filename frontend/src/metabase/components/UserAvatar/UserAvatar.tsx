import { isEmail } from "metabase/lib/email";
import { Avatar, type AvatarProps, Box, Flex, Icon } from "metabase/ui";
import type { User } from "metabase-types/api";

interface UserAvatarProps extends AvatarProps {
  user: User;
  mayor?: boolean;
}

interface GroupProps {
  user: Group;
  mayor?: boolean;
}

interface Group {
  first_name: string;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export function UserAvatar({
  user,
  mayor = false,
  ...props
}: UserAvatarProps | GroupProps) {
  return (
    <Box pos="relative">
      <Avatar {...props} src={user.picture_url}>
        {userInitials(user)}
      </Avatar>
      {mayor && (
        <Flex pos="absolute" top={-15} justify="center" left={0} right={0}>
          <Icon name="crown" size={32} color="gold" />
        </Flex>
      )}
    </Box>
  );
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
