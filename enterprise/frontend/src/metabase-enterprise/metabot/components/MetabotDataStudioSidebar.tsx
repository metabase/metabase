import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocation } from "metabase/selectors/routing";

import { METABOT_USE_CASES } from "../constants";

import { Metabot } from "./Metabot";

export function MetabotDataStudioSidebar() {
  const location = useSelector(getLocation);
  const isOnTransformsPage = location.pathname?.startsWith(
    Urls.transformList(),
  );

  return (
    <Metabot
      hide={!isOnTransformsPage}
      requiredUseCases={[METABOT_USE_CASES.TRANSFORMS]}
      config={{
        preventRetryMessage: true,
        preventClose: true,
        hideSuggestedPrompts: true,
        emptyText: t`Let's transform your data together!`,
        suggestionModels: ["dataset", "transform", "table", "database"],
      }}
    />
  );
}
