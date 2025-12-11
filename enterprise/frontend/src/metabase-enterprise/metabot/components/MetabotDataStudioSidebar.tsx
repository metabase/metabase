import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getLocation } from "metabase/selectors/routing";

import { Metabot } from "./Metabot";

export function MetabotDataStudioSidebar() {
  const location = useSelector(getLocation);
  const enabledUseCases = useSetting("metabot-enabled-use-cases");
  const isTransformsEnabled = enabledUseCases?.includes("transforms") ?? false;
  const isOnTransformsPage = location.pathname?.startsWith(
    Urls.transformList(),
  );
  const disabled = !isOnTransformsPage || !isTransformsEnabled;

  return (
    <Metabot
      hide={disabled}
      requiredUseCases={["transforms"]}
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
