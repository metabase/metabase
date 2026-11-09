import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import * as Urls from "metabase/urls";

type TabName =
  | "guide"
  | "data"
  | "published-data"
  | "metrics"
  | "dashboards"
  | "snippets"
  | "python-snippets"
  | "actions"
  | "data-apps"
  | "transforms"
  | "dependencies"
  | "schema-viewer"
  | "glossary"
  | "git-sync"
  | "settings";

export const getCurrentTab = (pathname: string): TabName => {
  switch (true) {
    case pathname.startsWith(Urls.dataStudioGuide()):
      return "guide";
    case pathname.startsWith(Urls.dataStudioGlossary()):
      return "glossary";
    case pathname.startsWith(Urls.dataStudioGitSync()):
      return "git-sync";
    case pathname.startsWith(Urls.dependencyGraph()):
      return "dependencies";
    case pathname.startsWith(Urls.dataStudioSchemaViewer()):
      return "schema-viewer";
    case pathname.startsWith(Urls.dataStudioSnippets()):
      return "snippets";
    case pathname.startsWith(Urls.dataStudioActions()):
      return "actions";
    case pathname.startsWith(Urls.dataStudioDataApps()):
      return "data-apps";
    case pathname.startsWith(Urls.dataStudioMetrics()):
      return "metrics";
    case pathname.startsWith(Urls.dataStudioLibrary()):
      return "published-data";
    case pathname.startsWith(Urls.dataStudioDashboards()):
      return "dashboards";
    case pathname.startsWith(getPythonSnippetsUrl()):
      return "python-snippets";
    case pathname.startsWith(Urls.transformList()):
      return "transforms";
    case pathname.startsWith(Urls.dataStudioData()):
      return "data";
    case pathname.startsWith(Urls.dataStudioSettings()):
      return "settings";
    default:
      return "guide";
  }
};

/**
 * PROTOTYPE: "Python snippets" is the shared Python library that transforms
 * import, which lives under the transforms section
 */
export const getPythonSnippetsUrl = () =>
  Urls.transformPythonLibrary({
    path: PLUGIN_TRANSFORMS_PYTHON.sharedLibImportPath,
  });
