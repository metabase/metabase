import * as Urls from "metabase/urls";

type TabName =
  | "guide"
  | "data"
  | "library"
  | "transforms"
  | "dependencies"
  | "schema-viewer"
  | "glossary"
  | "git-sync"
  | "workspaces"
  | "settings";

export const getCurrentTab = (pathname: string): TabName => {
  switch (true) {
    case pathname.startsWith(Urls.dataStudioGuide()):
      return "guide";
    case pathname.startsWith(Urls.dataStudioGlossary()):
      return "glossary";
    case pathname.startsWith(Urls.dataStudioGitSync()):
      return "git-sync";
    case pathname.startsWith(Urls.workspaces()):
      return "workspaces";
    case pathname.startsWith(Urls.dependencyGraph()):
      return "dependencies";
    case pathname.startsWith(Urls.dataStudioSchemaViewer()):
      return "schema-viewer";
    case pathname.startsWith(Urls.dataStudioLibrary()):
      return "library";
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
