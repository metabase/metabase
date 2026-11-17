import { Outlet } from "metabase/router";
import { Box, rem } from "metabase/ui";
import type { User } from "metabase-types/api";

import { AccountHeader } from "../AccountHeader";

import S from "./AccountLayout.module.css";

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
    <div className={S.root}>
      <div className={S.header}>
        <AccountHeader
          user={user}
          path={path}
          onChangeLocation={onChangeLocation}
        />
      </div>
      <Box
        mx="auto"
        px={{ base: "sm", sm: "lg" }}
        py={{ base: "sm", sm: "xxl" }}
        w="100%"
        maw={rem(540)}
      >
        <Outlet />
      </Box>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AccountLayout;
