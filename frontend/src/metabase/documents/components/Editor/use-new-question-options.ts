import { useMemo } from "react";
import { t } from "ttag";

import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/current-user";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useSelector } from "metabase/redux";
import type { NewQuestionOption } from "metabase/rich_text_editing/tiptap/extensions/Command/types";
import { usePrototypeFlag } from "metabase/utils/prototype-flags";

export const useNewQuestionOptions = (): NewQuestionOption[] => {
  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const { canUseMetabot } = useUserMetabotPermissions();
  const hasEventAnalytics = usePrototypeFlag("event-analytics");

  return useMemo(() => {
    const options: NewQuestionOption[] = [];

    if (canUseMetabot) {
      options.push({ label: t`AI question`, icon: "metabot", value: "ai" });
    }

    if (hasDataAccess && hasEventAnalytics) {
      options.push({
        label: t`Product event analysis`,
        icon: "funnel",
        value: "event-analysis",
      });
    }

    if (hasDataAccess) {
      options.push({
        label: t`GUI query`,
        icon: "notebook",
        value: "notebook",
      });
    }

    if (hasNativeWrite) {
      options.push({ label: t`SQL query`, icon: "sql", value: "native" });
    }

    return options;
  }, [canUseMetabot, hasDataAccess, hasEventAnalytics, hasNativeWrite]);
};
