import { Outlet } from "metabase/router";
import { Box, Flex } from "metabase/ui";

import DeprecationNotice from "../../containers/DeprecationNotice";

export const AdminApp = (): JSX.Element => {
  return (
    <Flex direction="column" h="100%">
      <DeprecationNotice />
      <Box flex="1" mih={0}>
        <Outlet />
      </Box>
    </Flex>
  );
};
