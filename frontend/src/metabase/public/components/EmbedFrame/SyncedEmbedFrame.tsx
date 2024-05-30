import { useEffect } from "react";
import type { WithRouterProps } from "react-router";
import { withRouter } from "react-router";

import type { DashboardUrlHashOptions } from "metabase/dashboard/types";
import { parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { setInitialUrlOptions } from "metabase/redux/embed";

import type { EmbedFrameProps } from "./EmbedFrame";
import EmbedFrame from "./EmbedFrame";

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
  } = parseHashOptions(location.hash) as DashboardUrlHashOptions;

  return (
    <EmbedFrame
      {...embedFrameProps}
      bordered={bordered}
      titled={titled}
      theme={theme}
      hide_parameters={hide_parameters}
      hide_download_button={hide_download_button}
    >
      {children}
    </EmbedFrame>
  );
};

export const SyncedEmbedFrame = withRouter<EmbedFrameProps>(
  SyncedEmbedFrameInner,
);
