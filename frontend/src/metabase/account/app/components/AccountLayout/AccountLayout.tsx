import { Outlet } from "metabase/router";
import { Box, rem } from "metabase/ui";
import type { User } from "metabase-types/api";

import { AccountHeader } from "../AccountHeader";

interface AccountLayoutProps {
  user: User | null;
  path?: string;
  onChangeLocation: (nextLocation: string) => void;
}

const AccountLayout = ({
  user,
  path,
  onChangeLocation,
}: AccountLayoutProps) => {
  if (!user) {
    return null;
  }

  return (
    <div>
      <AccountHeader
        user={user}
        path={path}
        onChangeLocation={onChangeLocation}
      />
      <Box
        mx="auto"
        px={{ base: "sm", sm: "md" }}
        py={{ base: "sm", sm: "xl" }}
        w={{ base: "100%", sm: rem(540) }}
      >
        <Outlet />
      </Box>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AccountLayout;
