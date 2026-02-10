import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocation } from "metabase/selectors/routing";

import { Metabot } from "./Metabot";

export function MetabotDataStudioSidebar() {
  const location = useSelector(getLocation);
  const disabled = !location.pathname?.startsWith(Urls.transformList());

  return (
    <Metabot
      hide={disabled}
      config={{
        preventRetryMessage: true,
        hideSuggestedPrompts: true,
        emptyText: t`Let's transform your data together!`,
        suggestionModels: ["dataset", "transform", "table", "database"],
      }}
    />
  );
}
