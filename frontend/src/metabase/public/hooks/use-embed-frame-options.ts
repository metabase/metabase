import type { Location } from "history";
import { useEffect } from "react";

import type { DashboardUrlHashOptions } from "metabase/dashboard/types";
import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { setInitialUrlOptions } from "metabase/redux/embed";

export const useEmbedFrameOptions = ({ location }: { location: Location }) => {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(setInitialUrlOptions(location));
  }, [dispatch, location]);

  const {
    background,
    bordered = isWithinIframe(),
    titled = true,
    theme,
    hide_parameters,
    hide_download_button,
  } = parseHashOptions(location.hash) as DashboardUrlHashOptions;

  return {
    background,
    bordered,
    titled,
    theme,
    hide_parameters,
    hide_download_button,
  };
};
