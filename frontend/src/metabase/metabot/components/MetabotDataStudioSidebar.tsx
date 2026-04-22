import { t } from "ttag";

import { getLocation } from "metabase/selectors/routing";
import { useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";

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
