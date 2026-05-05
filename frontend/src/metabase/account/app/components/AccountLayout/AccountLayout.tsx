import type { Path } from "history";
import type { ReactNode } from "react";

import { Box, rem } from "metabase/ui";
import type { User } from "metabase-types/api";

import { AccountHeader } from "../AccountHeader";

interface AccountLayoutProps {
  user: User | null;
  path?: string;
  onChangeLocation: (nextLocation: Path) => void;
  children?: ReactNode;
}

const AccountLayout = ({
  children,
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
        {children}
      </Box>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AccountLayout;
