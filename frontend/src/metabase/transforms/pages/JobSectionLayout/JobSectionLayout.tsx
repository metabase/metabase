import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";
import { Flex } from "metabase/ui";

export const JobSectionLayout = () => {
  usePageTitle(t`Jobs`, { titleIndex: 0 });
  return (
    <Flex direction="column" w="100%" h="100%">
      <Outlet />
    </Flex>
  );
};
