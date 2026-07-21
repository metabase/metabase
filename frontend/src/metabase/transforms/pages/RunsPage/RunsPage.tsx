import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";
import { Flex } from "metabase/ui";

export function RunsPage() {
  usePageTitle(t`Runs`);

  return (
    <Flex direction="column" w="100%" h="100%">
      <Outlet />
    </Flex>
  );
}
