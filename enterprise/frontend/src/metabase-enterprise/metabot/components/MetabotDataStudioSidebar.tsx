import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocation } from "metabase/selectors/routing";

import { METABOT_USE_CASES } from "../constants";

import { Metabot } from "./Metabot";

export function MetabotDataStudioSidebar() {
  const location = useSelector(getLocation);
  const enabledUseCases = useSetting("metabot-enabled-use-cases");
  const isTransformsEnabled =
    enabledUseCases?.includes(METABOT_USE_CASES.TRANSFORMS) ?? false;
  const isOnTransformsPage = location.pathname?.startsWith(
    Urls.transformList(),
  );
  const disabled = !isOnTransformsPage || !isTransformsEnabled;

  return (
    <Metabot
      hide={disabled}
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
