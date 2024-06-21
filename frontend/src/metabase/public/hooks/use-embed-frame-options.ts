import type { Location } from "history";

import type { DashboardUrlHashOptions } from "metabase/dashboard/types";
import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";

import type { DisplayTheme } from "../lib/types";

export const useEmbedFrameOptions = ({
  location,
}: {
  location: Location;
}): {
  bordered: boolean;
  titled: boolean;
  theme?: DisplayTheme;
  hide_parameters?: string;
  hide_download_button?: boolean;
} => {
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
    hide_parameters: hide_parameters as string,
    hide_download_button: hide_download_button as boolean,
  };
};
