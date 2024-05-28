import { useEffect } from "react";
import type { WithRouterProps } from "react-router";
import { withRouter } from "react-router";

import type { DashboardUrlHashOptions } from "metabase/dashboard/types";
import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import type { EmbedFrameProps } from "metabase/public/components/EmbedFrame/EmbedFrame";
import EmbedFrame from "metabase/public/components/EmbedFrame/EmbedFrame";
import { setInitialUrlOptions } from "metabase/redux/embed";

const SyncedEmbedFrameInner = ({
  location,
  children,
  ...embedFrameProps
}: EmbedFrameProps & WithRouterProps) => {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(setInitialUrlOptions(location));
  }, [dispatch, location]);

  const {
    bordered = isWithinIframe(),
    titled = true,
    theme,
    hide_parameters,
    hide_download_button,
    font,
    fullscreen,
    refresh,
  } = parseHashOptions(location.hash) as DashboardUrlHashOptions;

  return (
    <EmbedFrame
      {...embedFrameProps}
      bordered={bordered}
      titled={titled}
      theme={theme}
      hide_parameters={hide_parameters}
      hide_download_button={hide_download_button}
      font={font}
      fullscreen={fullscreen}
      refresh={refresh}
    >
      {children}
    </EmbedFrame>
  );
};

export const SyncedEmbedFrame = withRouter<EmbedFrameProps>(
  SyncedEmbedFrameInner,
);
