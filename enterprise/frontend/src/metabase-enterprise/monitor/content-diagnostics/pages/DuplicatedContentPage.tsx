import { DuplicatedContent } from "../components";
import { duplicatedContentConfig } from "../config";

import { ContentDiagnosticsPage } from "./ContentDiagnosticsPage";

export function DuplicatedContentPage() {
  return (
    <ContentDiagnosticsPage
      config={duplicatedContentConfig}
      component={DuplicatedContent}
    />
  );
}
