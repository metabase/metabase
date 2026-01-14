import * as Urls from "metabase/lib/urls";

type TabName =
  | "data"
  | "library"
  | "transforms"
  | "jobs"
  | "runs"
  | "tasks"
  | "dependencies"
  | "glossary"
  | "settings";

export const getCurrentTab = (pathname: string): TabName => {
  switch (true) {
    case pathname.startsWith(Urls.dataStudioGlossary()):
      return "glossary";
    case pathname.startsWith(Urls.transformJobList()):
      return "jobs";
    case pathname.startsWith(Urls.dependencyTasks()):
      return "tasks";
    case pathname.startsWith(Urls.dependencyGraph()):
      return "dependencies";
    case pathname.startsWith(Urls.dataStudioLibrary()):
      return "library";
    case pathname.startsWith(Urls.transformRunList()):
      return "runs";
    case pathname.startsWith(Urls.transformList()):
      return "transforms";
    case pathname.startsWith(Urls.dataStudioSettings()):
      return "settings";
    default:
      return "data";
  }
};
