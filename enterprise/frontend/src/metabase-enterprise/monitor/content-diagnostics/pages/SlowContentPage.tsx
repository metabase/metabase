import { SlowContent } from "../components";
import { slowContentConfig } from "../config";

import { ContentDiagnosticsPage } from "./ContentDiagnosticsPage";

export function SlowContentPage() {
  return (
    <ContentDiagnosticsPage
      config={slowContentConfig}
      component={SlowContent}
    />
  );
}
