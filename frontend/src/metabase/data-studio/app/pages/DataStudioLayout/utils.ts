import * as Urls from "metabase/lib/urls";

type TabName =
  | "data"
  | "library"
  | "transforms"
  | "jobs"
  | "runs"
  | "dependencies"
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
    default:
      return "data";
  }
};
