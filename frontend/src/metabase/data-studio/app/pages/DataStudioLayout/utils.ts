import * as Urls from "metabase/utils/urls";

type TabName =
  | "data"
  | "library"
  | "metrics"
  | "segments"
  | "measures"
  | "transforms"
  | "jobs"
  | "runs"
  | "dependencies"
  | "workspace"
  | "dependency-diagnostics"
  | "glossary"
  | "git-sync";

export const getCurrentTab = (pathname: string): TabName => {
  switch (true) {
    case pathname.startsWith(Urls.dataStudioGlossary()):
      return "glossary";
    case pathname.startsWith(Urls.dataStudioGitSync()):
      return "git-sync";
    case pathname.startsWith(Urls.transformJobList()):
      return "jobs";
    case pathname.startsWith(Urls.dependencyGraph()):
      return "dependencies";
    case pathname.startsWith(Urls.dependencyDiagnostics()):
      return "dependency-diagnostics";
    case pathname.startsWith(Urls.dataStudioLibrary()):
      return "library";
    case pathname.startsWith(Urls.transformRunList()):
      return "runs";
    case pathname.startsWith(Urls.transformList()):
      return "transforms";
    case pathname.startsWith(Urls.dataStudioWorkspaceList()):
      return "workspace";
    case pathname.startsWith(Urls.dataStudioMetricsList()):
      return "metrics";
    case pathname.startsWith(Urls.dataStudioSegmentsList()):
      return "segments";
    case pathname.startsWith(Urls.dataStudioMeasuresList()):
      return "measures";
    default:
      return "data";
  }
};
