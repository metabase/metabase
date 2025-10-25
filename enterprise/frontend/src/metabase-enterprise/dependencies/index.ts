import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CheckDependenciesForm } from "./components/CheckDependenciesForm";
import { CheckDependenciesModal } from "./components/CheckDependenciesModal";
import { CheckDependenciesTitle } from "./components/CheckDependenciesTitle";
import { DependencyGraph } from "./components/DependencyGraph";
import { useCheckCardDependencies } from "./hooks/use-check-card-dependencies";
import { useCheckSnippetDependencies } from "./hooks/use-check-snippet-dependencies";
import { useCheckTransformDependencies } from "./hooks/use-check-transform-dependencies";
import { getDependencyRoutes } from "./routes";
import { parseDependencyEntry } from "./utils";

if (hasPremiumFeature("dependencies")) {
  PLUGIN_DEPENDENCIES.isEnabled = true;
  PLUGIN_DEPENDENCIES.getDependencyRoutes = getDependencyRoutes;
  PLUGIN_DEPENDENCIES.parseDependencyEntry = parseDependencyEntry;
  PLUGIN_DEPENDENCIES.DependencyGraph = DependencyGraph;
  PLUGIN_DEPENDENCIES.CheckDependenciesForm = CheckDependenciesForm;
  PLUGIN_DEPENDENCIES.CheckDependenciesModal = CheckDependenciesModal;
  PLUGIN_DEPENDENCIES.CheckDependenciesTitle = CheckDependenciesTitle;
  PLUGIN_DEPENDENCIES.useCheckCardDependencies = useCheckCardDependencies;
  PLUGIN_DEPENDENCIES.useCheckSnippetDependencies = useCheckSnippetDependencies;
  PLUGIN_DEPENDENCIES.useCheckTransformDependencies =
    useCheckTransformDependencies;
}
