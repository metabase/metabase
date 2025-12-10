import * as Urls from "metabase/lib/urls";

type TabName =
  | "data"
  | "modeling"
  | "transforms"
  | "jobs"
  | "runs"
  | "dependencies"
  | "glossary";

export const getCurrentTab = (pathname: string): TabName => {
  switch (true) {
    case pathname.startsWith(Urls.dataStudioGlossary()):
      return "glossary";
    case pathname.startsWith(Urls.transformJobList()):
      return "jobs";
    case pathname.startsWith(Urls.dependencyGraph()):
      return "dependencies";
    case pathname.startsWith(Urls.dataStudioModeling()):
      return "modeling";
    case pathname.startsWith(Urls.transformRunList()):
      return "runs";
    case pathname.startsWith(Urls.transformList()):
      return "transforms";
    default:
      return "data";
  }
};
