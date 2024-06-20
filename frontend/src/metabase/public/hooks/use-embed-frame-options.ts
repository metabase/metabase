import type { Location } from "history";

import type { DashboardUrlHashOptions } from "metabase/dashboard/types";
import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";

export const useEmbedFrameOptions = ({ location }: { location: Location }) => {
  const {
    bordered = isWithinIframe(),
    titled = true,
    theme,
    hide_parameters,
    hide_download_button,
  } = parseHashOptions(location.hash) as DashboardUrlHashOptions;

  return {
    bordered,
    titled,
    theme,
    hide_parameters,
    hide_download_button,
  };
};
