import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CheckDependenciesForm } from "./components/CheckDependenciesForm";
import { CheckDependenciesModal } from "./components/CheckDependenciesModal";
import { CheckDependenciesTitle } from "./components/CheckDependenciesTitle";
import { DependencyFlow } from "./components/DependencyFlow";
import { useCheckCardDependencies } from "./hooks/use-check-card-dependencies";
import { useCheckSnippetDependencies } from "./hooks/use-check-snippet-dependencies";
import { useCheckTransformDependencies } from "./hooks/use-check-transform-dependencies";

if (hasPremiumFeature("dependencies")) {
  PLUGIN_DEPENDENCIES.DependencyFlow = DependencyFlow;
  PLUGIN_DEPENDENCIES.CheckDependenciesForm = CheckDependenciesForm;
  PLUGIN_DEPENDENCIES.CheckDependenciesModal = CheckDependenciesModal;
  PLUGIN_DEPENDENCIES.CheckDependenciesTitle = CheckDependenciesTitle;
  PLUGIN_DEPENDENCIES.useCheckCardDependencies = useCheckCardDependencies;
  PLUGIN_DEPENDENCIES.useCheckSnippetDependencies = useCheckSnippetDependencies;
  PLUGIN_DEPENDENCIES.useCheckTransformDependencies =
    useCheckTransformDependencies;
}
