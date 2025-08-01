import RedirectWidget from "../widgets/RedirectWidget";

import type { AdminSettingComponentProps } from "./types";

export function InteractiveEmbeddingSettings(
  _props: AdminSettingComponentProps,
) {
  return (
    <RedirectWidget to="/admin/settings/embedding-in-other-applications" />
  );
}
