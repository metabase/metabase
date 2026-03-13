import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CheckDependenciesForm } from "./components/CheckDependenciesForm";
import { CheckDependenciesModal } from "./components/CheckDependenciesModal";
import { CheckDependenciesTitle } from "./components/CheckDependenciesTitle";
import { DependencyGraphPage } from "./pages/DependencyGraphPage";

if (hasPremiumFeature("dependencies")) {
  // TODO Alex P re-enable after v57
  PLUGIN_DEPENDENCIES.isEnabled = false;
  PLUGIN_DEPENDENCIES.DependencyGraphPage = DependencyGraphPage;
  PLUGIN_DEPENDENCIES.CheckDependenciesForm = CheckDependenciesForm;
  PLUGIN_DEPENDENCIES.CheckDependenciesModal = CheckDependenciesModal;
  PLUGIN_DEPENDENCIES.CheckDependenciesTitle = CheckDependenciesTitle;
}
