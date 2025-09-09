import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CheckDependenciesForm } from "./components/CheckDependenciesForm";
import { CheckDependenciesTitle } from "./components/CheckDependenciesTitle";
import { useCheckCardDependencies } from "./hooks/use-check-card-dependencies";

if (hasPremiumFeature("dependencies")) {
  PLUGIN_DEPENDENCIES.CheckDependenciesForm = CheckDependenciesForm;
  PLUGIN_DEPENDENCIES.CheckDependenciesTitle = CheckDependenciesTitle;
  PLUGIN_DEPENDENCIES.useCheckCardDependencies = useCheckCardDependencies;
}
