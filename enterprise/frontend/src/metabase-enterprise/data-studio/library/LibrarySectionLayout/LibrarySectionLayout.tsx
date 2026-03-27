import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

type LibrarySectionLayoutProps = {
  children?: ReactNode;
};

export function LibrarySectionLayout({ children }: LibrarySectionLayoutProps) {
  usePageTitle(t`Library`);

  return <>{children}</>;
}
