import { t } from "ttag";

import { useLocation } from "metabase/router";
import * as Urls from "metabase/urls";

import { Metabot } from "./Metabot";

export function MetabotDataStudioSidebar() {
  const location = useLocation();
  const disabled = !location.pathname?.startsWith(Urls.transformList());

  return (
    <Metabot
      hide={disabled}
      config={{
        agentId: "omnibot",
        preventRetryMessage: true,
        hideSuggestedPrompts: true,
        emptyText: t`Let's transform your data together!`,
        suggestionModels: ["dataset", "transform", "table", "database"],
      }}
    />
  );
}
