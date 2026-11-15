import { t } from "ttag";

import type { AdminPath } from "metabase/redux/store";

export const getPerformanceAdminPaths = (metadata: AdminPath[]) =>
  metadata.map((tab) => ({
    ...tab,
    getName: () => `${t`Performance`} - ${tab.getName()}`,
  }));
