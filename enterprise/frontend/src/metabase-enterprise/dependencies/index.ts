import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CheckDependenciesForm } from "./components/CheckDependenciesForm";
import { CheckDependenciesModal } from "./components/CheckDependenciesModal";
import { CheckDependenciesTitle } from "./components/CheckDependenciesTitle";
import { useCheckCardDependencies } from "./hooks/use-check-card-dependencies";
import { useCheckSnippetDependencies } from "./hooks/use-check-snippet-dependencies";
import { useCheckTransformDependencies } from "./hooks/use-check-transform-dependencies";
import { useGetDependenciesCount } from "./hooks/use-get-dependencies-count";
import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import {
  getDataStudioDependencyDiagnosticsRoutes,
  getDataStudioDependencyRoutes,
} from "./routes";

/**
 * Initialize dependencies plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("dependencies")) {
    PLUGIN_DEPENDENCIES.isEnabled = true;
    PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes =
      getDataStudioDependencyRoutes;
    PLUGIN_DEPENDENCIES.getDataStudioDependencyDiagnosticsRoutes =
      getDataStudioDependencyDiagnosticsRoutes;
    PLUGIN_DEPENDENCIES.DependencyGraphPage = DependencyGraphPage;
    PLUGIN_DEPENDENCIES.CheckDependenciesForm = CheckDependenciesForm;
    PLUGIN_DEPENDENCIES.CheckDependenciesModal = CheckDependenciesModal;
    PLUGIN_DEPENDENCIES.CheckDependenciesTitle = CheckDependenciesTitle;
    PLUGIN_DEPENDENCIES.useCheckCardDependencies = useCheckCardDependencies;
    PLUGIN_DEPENDENCIES.useCheckSnippetDependencies =
      useCheckSnippetDependencies;
    PLUGIN_DEPENDENCIES.useCheckTransformDependencies =
      useCheckTransformDependencies;
    PLUGIN_DEPENDENCIES.useGetDependenciesCount = useGetDependenciesCount;
  }
}
