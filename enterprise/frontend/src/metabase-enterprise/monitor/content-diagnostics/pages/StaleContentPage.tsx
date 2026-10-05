import { StaleContent } from "../components";
import { staleContentConfig } from "../config";

import { ContentDiagnosticsPage } from "./ContentDiagnosticsPage";

export function StaleContentPage() {
  return (
    <ContentDiagnosticsPage
      config={staleContentConfig}
      component={StaleContent}
    />
  );
}
