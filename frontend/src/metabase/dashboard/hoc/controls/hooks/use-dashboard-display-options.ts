import { useState } from "react";

import { useDashboardFullscreen } from "metabase/dashboard/hoc/controls/hooks/use-dashboard-fullscreen";
import { useDashboardRefreshPeriod } from "metabase/dashboard/hoc/controls/hooks/use-dashboard-refresh-period";
import { useDashboardTheme } from "metabase/dashboard/hoc/controls/hooks/use-dashboard-theme";
import type { DashboardDisplayOptionControls } from "metabase/dashboard/hoc/controls/types";
import { isWithinIframe } from "metabase/lib/dom";

type UseDashboardDisplayOptionsProps = {
  onRefresh: () => Promise<void>;
};

export function useDashboardDisplayOptions({
  onRefresh,
}: UseDashboardDisplayOptionsProps): DashboardDisplayOptionControls {
  const [bordered, setBordered] = useState<boolean>(isWithinIframe());
  const [titled, setTitled] = useState(true);
  const [hideDownloadButton, setHideDownloadButton] = useState(false);

  const [hideParameters, setHideParameters] = useState<string | null>(null);

  return {
    ...useDashboardFullscreen(),
    ...useDashboardTheme(),
    ...useDashboardRefreshPeriod({ onRefresh }),
    bordered,
    setBordered,
    titled,
    setTitled,
    hideDownloadButton,
    setHideDownloadButton,
    hideParameters,
    setHideParameters,
  };
}
