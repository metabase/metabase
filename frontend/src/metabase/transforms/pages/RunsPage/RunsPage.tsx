import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Flex } from "metabase/ui";

type RunsPageProps = {
  children: ReactNode;
};

// Stable wrapper for the runs section: it stays mounted while the grouped
// (/runs) and detailed (/runs/individual) views swap. Each view renders its own
// header + full-height sidebar; the "Detailed view" switch in the filter row
// moves between them.
export function RunsPage({ children }: RunsPageProps) {
  usePageTitle(t`Runs`);

  return (
    <Flex direction="column" w="100%" h="100%">
      {children}
    </Flex>
  );
}
