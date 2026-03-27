import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Flex } from "metabase/ui";

interface TransformTopNavLayoutProps {
  children: ReactNode;
}

export const JobSectionLayout = ({ children }: TransformTopNavLayoutProps) => {
  usePageTitle(t`Jobs`, { titleIndex: 0 });
  return (
    <Flex direction="column" w="100%" h="100%">
      {children}
    </Flex>
  );
};
