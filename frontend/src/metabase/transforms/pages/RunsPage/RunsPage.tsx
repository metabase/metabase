import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Flex } from "metabase/ui";

type RunsPageProps = {
  children: ReactNode;
};

export function RunsPage({ children }: RunsPageProps) {
  usePageTitle(t`Runs`);

  return (
    <Flex direction="column" w="100%" h="100%">
      {children}
    </Flex>
  );
}
